import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, Typography } from "@/constants/theme";

type CreditType = "group" | "semi_private" | "private";

interface Lot {
  id: string;
  type: CreditType;
  qty_total: string | number;
  qty_remaining: string | number;
  price_per_credit: string | number | null;
  expires_at: string | null;
  status: string;
  created_at: string;
}

interface LedgerEntry {
  id: string;
  type: string;
  delta: string | number;
  reason: string;
  actor_role: string | null;
  balance_after: string | number;
  metadata: Record<string, unknown> | null;
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

interface Props {
  playerId: string;
}

export function AdminCreditV2Panel({ playerId }: Props) {
  const queryClient = useQueryClient();
  const [adjType, setAdjType] = useState<CreditType>("group");
  const [adjDelta, setAdjDelta] = useState<string>("");
  const [adjReason, setAdjReason] = useState<string>("");
  const [makeupType, setMakeupType] = useState<CreditType>("group");
  const [makeupQty, setMakeupQty] = useState<string>("1");
  const [makeupReason, setMakeupReason] = useState<string>("");
  const [showLedger, setShowLedger] = useState<boolean>(false);
  const [activePanel, setActivePanel] = useState<"adjust" | "makeup" | null>(
    null,
  );

  const walletQuery = useQuery<WalletData>({
    queryKey: [`/api/v2/credits/wallet/${playerId}`],
    enabled: !!playerId,
  });

  const enabled = walletQuery.data?.v2Enabled === true;

  const ledgerQuery = useQuery<{ entries: LedgerEntry[] }>({
    queryKey: [`/api/v2/credits/ledger/${playerId}`, { limit: 100 }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/v2/credits/ledger/${playerId}?limit=100`,
      );
      return res.json();
    },
    enabled: enabled && showLedger && !!playerId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: [`/api/v2/credits/wallet/${playerId}`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/v2/credits/ledger/${playerId}`],
    });
  };

  const adjustMutation = useMutation({
    mutationFn: async (vars: {
      type: CreditType;
      delta: number;
      reason: string;
    }) => {
      const res = await apiRequest("POST", "/api/v2/credits/manual-adjustment", {
        playerId,
        type: vars.type,
        delta: vars.delta,
        reason: vars.reason,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setAdjDelta("");
      setAdjReason("");
      setActivePanel(null);
      Alert.alert("Adjustment applied", "Player wallet updated.");
    },
    onError: (err: Error) => {
      Alert.alert("Adjustment failed", err.message || "Try again.");
    },
  });

  const makeupMutation = useMutation({
    mutationFn: async (vars: {
      type: CreditType;
      qty: number;
      reason: string;
    }) => {
      const res = await apiRequest("POST", "/api/v2/credits/makeup", {
        playerId,
        type: vars.type,
        qty: vars.qty,
        reason: vars.reason,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setMakeupQty("1");
      setMakeupReason("");
      setActivePanel(null);
      Alert.alert("Make-up awarded", "Credit added to player wallet.");
    },
    onError: (err: Error) => {
      Alert.alert("Make-up failed", err.message || "Try again.");
    },
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

  const wallet = walletQuery.data;

  return (
    <View
      style={{
        marginVertical: Spacing.md,
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
              fontSize: 14,
              letterSpacing: 0.5,
            }}
          >
            CREDIT ENGINE V2
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
            LIVE
          </Text>
        </View>
      </View>

      {walletQuery.isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} />
      ) : !wallet ? (
        <Text style={{ color: Colors.dark.textMuted, fontSize: 12 }}>
          No V2 wallet yet for this player.
        </Text>
      ) : (
        <>
          {/* Balance row */}
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

          {/* Active lots */}
          {wallet.activeLots.length > 0 ? (
            <View style={{ marginBottom: Spacing.sm }}>
              <Text
                style={{
                  ...Typography.small,
                  color: Colors.dark.textMuted,
                  marginBottom: 4,
                }}
              >
                Active lots ({wallet.activeLots.length})
              </Text>
              {wallet.activeLots.slice(0, 5).map((lot) => {
                const isExpiringSoon =
                  lot.expires_at &&
                  new Date(lot.expires_at).getTime() - Date.now() <
                    7 * 24 * 60 * 60 * 1000;
                return (
                  <View
                    key={lot.id}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 4,
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
                    <Text
                      style={{
                        fontSize: 11,
                        color: isExpiringSoon
                          ? Colors.dark.gold
                          : Colors.dark.textMuted,
                      }}
                    >
                      {lot.expires_at
                        ? `Exp ${fmtDate(lot.expires_at)}`
                        : "No expiry"}
                    </Text>
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
              No active lots. Total balance: {fmtNumber(totalActive)}
            </Text>
          )}

          {/* Action buttons */}
          <View
            style={{
              flexDirection: "row",
              gap: Spacing.sm,
              marginBottom: Spacing.sm,
            }}
          >
            <Pressable
              onPress={() =>
                setActivePanel(activePanel === "adjust" ? null : "adjust")
              }
              style={{
                flex: 1,
                paddingVertical: Spacing.sm,
                borderRadius: 8,
                alignItems: "center",
                backgroundColor:
                  activePanel === "adjust"
                    ? Colors.dark.primary
                    : `${Colors.dark.primary}20`,
                borderWidth: 1,
                borderColor: `${Colors.dark.primary}40`,
              }}
            >
              <Text
                style={{
                  color:
                    activePanel === "adjust"
                      ? Colors.dark.buttonText
                      : Colors.dark.primary,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                Adjust
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                setActivePanel(activePanel === "makeup" ? null : "makeup")
              }
              style={{
                flex: 1,
                paddingVertical: Spacing.sm,
                borderRadius: 8,
                alignItems: "center",
                backgroundColor:
                  activePanel === "makeup"
                    ? Colors.dark.successNeon
                    : `${Colors.dark.successNeon}20`,
                borderWidth: 1,
                borderColor: `${Colors.dark.successNeon}40`,
              }}
            >
              <Text
                style={{
                  color:
                    activePanel === "makeup"
                      ? Colors.dark.buttonText
                      : Colors.dark.successNeon,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                Make-up
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowLedger(!showLedger)}
              style={{
                flex: 1,
                paddingVertical: Spacing.sm,
                borderRadius: 8,
                alignItems: "center",
                backgroundColor: `${Colors.dark.text}10`,
                borderWidth: 1,
                borderColor: `${Colors.dark.text}20`,
              }}
            >
              <Text
                style={{
                  color: Colors.dark.text,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {showLedger ? "Hide" : "Audit"}
              </Text>
            </Pressable>
          </View>

          {activePanel === "adjust" ? (
            <View
              style={{
                padding: Spacing.sm,
                borderRadius: 10,
                backgroundColor: Colors.dark.backgroundRoot,
                marginBottom: Spacing.sm,
              }}
            >
              <Text
                style={{
                  ...Typography.small,
                  color: Colors.dark.textMuted,
                  marginBottom: 4,
                }}
              >
                Type
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  marginBottom: Spacing.sm,
                }}
              >
                {(["group", "semi_private", "private"] as CreditType[]).map(
                  (t) => (
                    <Pressable
                      key={t}
                      onPress={() => setAdjType(t)}
                      style={{
                        flex: 1,
                        paddingVertical: 6,
                        borderRadius: 6,
                        alignItems: "center",
                        backgroundColor:
                          adjType === t
                            ? `${TYPE_COLOR[t]}30`
                            : `${TYPE_COLOR[t]}10`,
                        borderWidth: 1,
                        borderColor:
                          adjType === t ? TYPE_COLOR[t] : `${TYPE_COLOR[t]}30`,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: TYPE_COLOR[t],
                          fontWeight: "700",
                        }}
                      >
                        {TYPE_LABEL[t]}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
              <Text
                style={{
                  ...Typography.small,
                  color: Colors.dark.textMuted,
                  marginBottom: 4,
                }}
              >
                Delta (use negative to remove)
              </Text>
              <TextInput
                value={adjDelta}
                onChangeText={setAdjDelta}
                keyboardType="numbers-and-punctuation"
                placeholder="e.g. 5 or -2"
                placeholderTextColor={Colors.dark.textMuted}
                style={{
                  backgroundColor: Colors.dark.backgroundSecondary,
                  color: Colors.dark.text,
                  borderRadius: 6,
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 6,
                  fontSize: 13,
                  marginBottom: Spacing.sm,
                  borderWidth: 1,
                  borderColor: `${Colors.dark.primary}30`,
                }}
              />
              <Text
                style={{
                  ...Typography.small,
                  color: Colors.dark.textMuted,
                  marginBottom: 4,
                }}
              >
                Reason (required, visible to player)
              </Text>
              <TextInput
                value={adjReason}
                onChangeText={setAdjReason}
                placeholder="Why this adjustment?"
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                style={{
                  backgroundColor: Colors.dark.backgroundSecondary,
                  color: Colors.dark.text,
                  borderRadius: 6,
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 6,
                  fontSize: 13,
                  minHeight: 50,
                  marginBottom: Spacing.sm,
                  borderWidth: 1,
                  borderColor: `${Colors.dark.primary}30`,
                }}
              />
              <Pressable
                disabled={
                  adjustMutation.isPending ||
                  !adjReason.trim() ||
                  !adjDelta.trim() ||
                  parseFloat(adjDelta) === 0 ||
                  Number.isNaN(parseFloat(adjDelta))
                }
                onPress={() =>
                  adjustMutation.mutate({
                    type: adjType,
                    delta: parseFloat(adjDelta),
                    reason: adjReason.trim(),
                  })
                }
                style={{
                  paddingVertical: Spacing.sm,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor:
                    !adjReason.trim() || !adjDelta.trim()
                      ? `${Colors.dark.primary}40`
                      : Colors.dark.primary,
                }}
              >
                {adjustMutation.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={Colors.dark.buttonText}
                  />
                ) : (
                  <Text
                    style={{
                      color: Colors.dark.buttonText,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Apply Adjustment
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {activePanel === "makeup" ? (
            <View
              style={{
                padding: Spacing.sm,
                borderRadius: 10,
                backgroundColor: Colors.dark.backgroundRoot,
                marginBottom: Spacing.sm,
              }}
            >
              <Text
                style={{
                  ...Typography.small,
                  color: Colors.dark.textMuted,
                  marginBottom: 4,
                }}
              >
                Type
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  marginBottom: Spacing.sm,
                }}
              >
                {(["group", "semi_private", "private"] as CreditType[]).map(
                  (t) => (
                    <Pressable
                      key={t}
                      onPress={() => setMakeupType(t)}
                      style={{
                        flex: 1,
                        paddingVertical: 6,
                        borderRadius: 6,
                        alignItems: "center",
                        backgroundColor:
                          makeupType === t
                            ? `${TYPE_COLOR[t]}30`
                            : `${TYPE_COLOR[t]}10`,
                        borderWidth: 1,
                        borderColor:
                          makeupType === t
                            ? TYPE_COLOR[t]
                            : `${TYPE_COLOR[t]}30`,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: TYPE_COLOR[t],
                          fontWeight: "700",
                        }}
                      >
                        {TYPE_LABEL[t]}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
              <View
                style={{
                  flexDirection: "row",
                  gap: Spacing.sm,
                  marginBottom: Spacing.sm,
                }}
              >
                <View style={{ width: 80 }}>
                  <Text
                    style={{
                      ...Typography.small,
                      color: Colors.dark.textMuted,
                      marginBottom: 4,
                    }}
                  >
                    Qty
                  </Text>
                  <TextInput
                    value={makeupQty}
                    onChangeText={setMakeupQty}
                    keyboardType="numeric"
                    style={{
                      backgroundColor: Colors.dark.backgroundSecondary,
                      color: Colors.dark.text,
                      borderRadius: 6,
                      paddingHorizontal: Spacing.sm,
                      paddingVertical: 6,
                      fontSize: 13,
                      borderWidth: 1,
                      borderColor: `${Colors.dark.primary}30`,
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      ...Typography.small,
                      color: Colors.dark.textMuted,
                      marginBottom: 4,
                    }}
                  >
                    Reason (optional)
                  </Text>
                  <TextInput
                    value={makeupReason}
                    onChangeText={setMakeupReason}
                    placeholder="Why a make-up?"
                    placeholderTextColor={Colors.dark.textMuted}
                    style={{
                      backgroundColor: Colors.dark.backgroundSecondary,
                      color: Colors.dark.text,
                      borderRadius: 6,
                      paddingHorizontal: Spacing.sm,
                      paddingVertical: 6,
                      fontSize: 13,
                      borderWidth: 1,
                      borderColor: `${Colors.dark.primary}30`,
                    }}
                  />
                </View>
              </View>
              <Pressable
                disabled={
                  makeupMutation.isPending ||
                  parseInt(makeupQty || "0", 10) <= 0
                }
                onPress={() =>
                  makeupMutation.mutate({
                    type: makeupType,
                    qty: parseInt(makeupQty, 10),
                    reason: makeupReason.trim(),
                  })
                }
                style={{
                  paddingVertical: Spacing.sm,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor: Colors.dark.successNeon,
                }}
              >
                {makeupMutation.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={Colors.dark.buttonText}
                  />
                ) : (
                  <Text
                    style={{
                      color: Colors.dark.buttonText,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Award Make-up
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {showLedger ? (
            <View
              style={{
                padding: Spacing.sm,
                borderRadius: 10,
                backgroundColor: Colors.dark.backgroundRoot,
                maxHeight: 320,
              }}
            >
              <Text
                style={{
                  ...Typography.small,
                  color: Colors.dark.textMuted,
                  marginBottom: Spacing.sm,
                }}
              >
                Audit log (most recent first)
              </Text>
              {ledgerQuery.isLoading ? (
                <ActivityIndicator color={Colors.dark.primary} />
              ) : ledgerQuery.data?.entries?.length ? (
                <ScrollView style={{ maxHeight: 280 }}>
                  {ledgerQuery.data.entries.map((e) => {
                    const delta = Number(e.delta);
                    const isPos = delta >= 0;
                    return (
                      <View
                        key={e.id}
                        style={{
                          paddingVertical: 6,
                          borderBottomWidth: 1,
                          borderBottomColor: `${Colors.dark.text}10`,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: Colors.dark.text,
                              fontWeight: "600",
                            }}
                          >
                            {e.reason}{" "}
                            <Text
                              style={{
                                color: Colors.dark.textMuted,
                                fontWeight: "400",
                              }}
                            >
                              · {TYPE_LABEL[e.type] || e.type}
                            </Text>
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: isPos
                                ? Colors.dark.successNeon
                                : Colors.dark.error,
                              fontWeight: "700",
                            }}
                          >
                            {isPos ? "+" : ""}
                            {fmtNumber(delta)}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            marginTop: 2,
                          }}
                        >
                          <Text
                            style={{ fontSize: 10, color: Colors.dark.textMuted }}
                          >
                            {fmtDateTime(e.occurred_at)}
                            {e.actor_role ? ` · ${e.actor_role}` : ""}
                            {e.metadata?.reason
                              ? ` · ${String(e.metadata.reason)}`
                              : ""}
                          </Text>
                          <Text
                            style={{ fontSize: 10, color: Colors.dark.textMuted }}
                          >
                            bal {fmtNumber(e.balance_after)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={{ fontSize: 12, color: Colors.dark.textMuted }}>
                  No ledger entries yet.
                </Text>
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

export default AdminCreditV2Panel;
