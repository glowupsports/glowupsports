import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest, buildPhotoUrl } from "@/lib/query-client";
import { formatTimeInTimezone } from "@/lib/dateUtils";
import { Image } from "expo-image";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

interface AvailablePlayer {
  id: string;
  name: string;
  ballLevel?: string | null;
  profilePhotoUrl?: string | null;
}

interface SessionPlayer {
  id?: string;
  name?: string | null;
  status?: string | null;
  attendanceStatus?: string | null;
}

export interface CalendarSessionForAdd {
  id: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  seriesId?: string | null;
  title?: string | null;
  maxPlayers?: number | null;
  players?: SessionPlayer[];
}

interface AddPlayerToSessionModalProps {
  visible: boolean;
  session: CalendarSessionForAdd | null;
  academyTimezone: string;
  onClose: () => void;
}

function prettySessionType(type: string): string {
  switch (type) {
    case "group":
      return "Group";
    case "semi_private":
      return "Semi-Private";
    case "private":
    case "private_adjusted":
      return "Private";
    case "physical":
      return "Physical";
    case "activity":
      return "Activity";
    default:
      return type;
  }
}

function creditTypeLabel(sessionType: string): string {
  if (sessionType === "semi_private") return "semi-private";
  if (sessionType === "private" || sessionType === "private_adjusted") return "private";
  if (sessionType === "group") return "group";
  return sessionType.replace("_", "-");
}

export function AddPlayerToSessionModal({
  visible,
  session,
  academyTimezone,
  onClose,
}: AddPlayerToSessionModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [playerSearch, setPlayerSearch] = useState("");
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPlayerSearch("");
      setPendingPlayerId(null);
    }
  }, [visible]);

  const { data: allPlayersData, isLoading: playersLoading } = useQuery<
    AvailablePlayer[]
  >({
    queryKey: ["/api/players"],
    enabled: visible,
  });
  const allPlayers = Array.isArray(allPlayersData) ? allPlayersData : [];

  const existingPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    (session?.players ?? []).forEach((p) => {
      if (p?.id && p.status !== "left") ids.add(p.id);
    });
    return ids;
  }, [session]);

  const availablePlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return allPlayers
      .filter((p) => !existingPlayerIds.has(p.id))
      .filter((p) =>
        q.length === 0
          ? true
          : (p.name || "").toLowerCase().includes(q) ||
            (p.ballLevel || "").toLowerCase().includes(q),
      )
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allPlayers, existingPlayerIds, playerSearch]);

  const isPast = useMemo(() => {
    if (!session) return false;
    return new Date(session.endTime).getTime() < Date.now();
  }, [session]);

  const addPlayerMutation = useMutation({
    mutationFn: async (input: {
      player: AvailablePlayer;
      skipCreditCheck?: boolean;
    }) => {
      if (!session) throw new Error("No session selected");
      const { player, skipCreditCheck = false } = input;
      const useSeriesBackfill = isPast && !!session.seriesId;

      if (useSeriesBackfill && session.seriesId) {
        const seriesRes = await apiRequest(
          "POST",
          `/api/coach/series/${session.seriesId}/players`,
          {
            playerId: player.id,
            attendedSessionIds: [session.id],
            skipCreditCheck,
          },
        );
        const seriesPayload = (await seriesRes.json().catch(() => ({}))) as {
          warning?: string;
          message?: string;
          requiredCreditType?: string;
        };
        if (
          seriesPayload?.warning === "credit_mismatch" &&
          !skipCreditCheck
        ) {
          throw Object.assign(
            new Error(
              seriesPayload.message ||
                `Player has no ${
                  seriesPayload.requiredCreditType ??
                  creditTypeLabel(session.sessionType)
                } credits available`,
            ),
            { creditMismatch: true, player },
          );
        }
        return { player, payload: seriesPayload };
      }

      const addRes = await apiRequest(
        "POST",
        `/api/coach/sessions/${session.id}/players`,
        { playerId: player.id, isGuest: false, skipCreditCheck },
      );
      const addPayload = (await addRes.json().catch(() => ({}))) as {
        warning?: string;
        message?: string;
        requiredCreditType?: string;
      };
      if (addPayload?.warning === "credit_mismatch" && !skipCreditCheck) {
        throw Object.assign(
          new Error(
            addPayload.message ||
              `Player has no ${
                addPayload.requiredCreditType ??
                creditTypeLabel(session.sessionType)
              } credits available`,
          ),
          { creditMismatch: true, player },
        );
      }
      return { player, payload: addPayload };
    },
    onMutate: ({ player }) => {
      setPendingPlayerId(player.id);
    },
    onSuccess: ({ player }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
      });
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).includes(`/coach/players/${player.id}/attendance-history`),
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/coach/players/${player.id}/attendance-summary`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/v2/credits/wallet/${player.id}`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/players/${player.id}/credit-balance`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      if (session?.seriesId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/coach/series", session.seriesId],
        });
      }
      setPendingPlayerId(null);
      onClose();
    },
    onError: (
      err: Error & {
        creditMismatch?: boolean;
        player?: AvailablePlayer;
      },
    ) => {
      setPendingPlayerId(null);
      if (err?.creditMismatch && err.player && session) {
        const label = creditTypeLabel(session.sessionType);
        const playerName = err.player.name;
        Alert.alert(
          "No matching credits",
          `${playerName} has no ${label} credits. Add anyway? A debt will be recorded.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Add anyway",
              onPress: () => {
                addPlayerMutation.mutate({
                  player: err.player as AvailablePlayer,
                  skipCreditCheck: true,
                });
              },
            },
          ],
        );
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Couldn't add player",
        err?.message || "Failed to add the player. Please try again.",
      );
    },
  });

  const handleSelectPlayer = (player: AvailablePlayer) => {
    if (addPlayerMutation.isPending) return;
    if (!session) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addPlayerMutation.mutate({ player });
  };

  const sessionTimeRange = session
    ? `${formatTimeInTimezone(session.startTime, academyTimezone)} – ${formatTimeInTimezone(session.endTime, academyTimezone)}`
    : "";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <LinearGradient
          colors={["rgba(0,224,255,0.12)", "transparent"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 160 }}
        />
        <View
          style={[
            styles.header,
            { paddingTop: insets.top > 0 ? Spacing.md : Spacing.lg },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Add Player to Session</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {session
                ? `${prettySessionType(session.sessionType)} · ${sessionTimeRange}`
                : ""}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.dark.text} />
          </Pressable>
        </View>

        <View
          style={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: Spacing.sm,
          }}
        >
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players..."
              placeholderTextColor={Colors.dark.textMuted}
              value={playerSearch}
              onChangeText={setPlayerSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {playerSearch.length > 0 ? (
              <Pressable onPress={() => setPlayerSearch("")} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={Colors.dark.textMuted}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
            gap: Spacing.sm,
          }}
          showsVerticalScrollIndicator={false}
        >
          {isPast ? (
            <Text style={styles.pastNote}>
              Past session — added players will be marked Present.
            </Text>
          ) : null}

          {playersLoading ? (
            <View style={styles.loadingBlock}>
              <TennisBallSpinner size="small" color={Colors.dark.xpCyan} />
              <Text style={styles.loadingText}>Loading players...</Text>
            </View>
          ) : null}

          {!playersLoading && availablePlayers.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Ionicons
                name="people-outline"
                size={28}
                color={Colors.dark.textMuted}
              />
              <Text style={styles.emptyText}>
                {playerSearch.length > 0
                  ? `No players match "${playerSearch}"`
                  : "All players are already in this session"}
              </Text>
            </View>
          ) : null}

          {availablePlayers.map((player) => {
            const isSubmitting =
              addPlayerMutation.isPending && pendingPlayerId === player.id;
            return (
              <Pressable
                key={player.id}
                onPress={() => handleSelectPlayer(player)}
                disabled={addPlayerMutation.isPending}
                style={({ pressed }) => [
                  styles.playerRow,
                  pressed && { opacity: 0.7 },
                ]}
              >
                {buildPhotoUrl(player.profilePhotoUrl) ? (
                  <Image
                    source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                    style={styles.playerAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerAvatarText}>
                      {(player.name || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {player.name}
                  </Text>
                  {player.ballLevel ? (
                    <Text style={styles.playerMeta} numberOfLines={1}>
                      {player.ballLevel} ball
                    </Text>
                  ) : null}
                </View>
                {isSubmitting ? (
                  <TennisBallSpinner size="small" color={Colors.dark.xpCyan} />
                ) : (
                  <Ionicons
                    name="add-circle"
                    size={26}
                    color={Colors.dark.xpCyan}
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: "700" as const,
  },
  headerSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 15,
    padding: 0,
  },
  pastNote: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontStyle: "italic",
    paddingHorizontal: 4,
  },
  loadingBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
  },
  emptyBlock: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: Spacing.md,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,224,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  playerAvatarText: {
    color: Colors.dark.xpCyan,
    fontSize: 16,
    fontWeight: "700" as const,
  },
  playerName: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  playerMeta: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});

export default AddPlayerToSessionModal;
