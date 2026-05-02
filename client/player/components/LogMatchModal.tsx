// Task #1583 — Modal for logging a player-vs-player match result.
// Supports free-text opponent name or searching for an in-app player.
import React, { useState, useCallback, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  FlatList,
  Switch,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface SearchedPlayer {
  id: string;
  name: string;
  photoUrl: string | null;
  level: number | null;
}

interface SetScore {
  p: string; // games won by logged player (string for input)
  o: string; // games won by opponent
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const EMPTY_SET: SetScore = { p: "", o: "" };

export default function LogMatchModal({ visible, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // --- form state ---
  const [opponentName, setOpponentName] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<SearchedPlayer | null>(null);
  const [searchResults, setSearchResults] = useState<SearchedPlayer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [sets, setSets] = useState<SetScore[]>([{ ...EMPTY_SET }]);
  const [iWon, setIWon] = useState(true);
  const [playedAt, setPlayedAt] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- player search ---
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      const url = new URL("/api/player/search-players", getApiUrl());
      url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), { headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      setSearchResults(data.players ?? []);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleOpponentNameChange = useCallback(
    (text: string) => {
      setOpponentName(text);
      setSelectedOpponent(null);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => runSearch(text), 350);
    },
    [runSearch],
  );

  const selectOpponent = useCallback((p: SearchedPlayer) => {
    setSelectedOpponent(p);
    setOpponentName(p.name);
    setShowDropdown(false);
    setSearchResults([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const clearOpponent = useCallback(() => {
    setSelectedOpponent(null);
    setOpponentName("");
    setShowDropdown(false);
  }, []);

  // --- sets management ---
  const updateSet = useCallback((idx: number, field: "p" | "o", value: string) => {
    setSets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value.replace(/\D/g, "").slice(0, 2) };
      return next;
    });
  }, []);

  const addSet = useCallback(() => {
    if (sets.length < 5) setSets((prev) => [...prev, { ...EMPTY_SET }]);
  }, [sets.length]);

  const removeSet = useCallback((idx: number) => {
    if (sets.length > 1) setSets((prev) => prev.filter((_, i) => i !== idx));
  }, [sets.length]);

  // --- submission ---
  const mutation = useMutation({
    mutationFn: async () => {
      const scoreJson = sets
        .filter((s) => s.p !== "" || s.o !== "")
        .map((s) => ({ p: parseInt(s.p || "0", 10), o: parseInt(s.o || "0", 10) }));

      const body = {
        opponentId: selectedOpponent?.id ?? null,
        opponentName: selectedOpponent?.name ?? opponentName.trim(),
        playedAt: new Date(playedAt).toISOString(),
        scoreJson,
        loggedPlayerWon: iWon,
      };

      const res = await apiRequest("POST", "/api/player/me/match-results", body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to log match");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/match-results"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
      onSuccess?.();
    },
  });

  const handleSubmit = useCallback(() => {
    if (!opponentName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    mutation.mutate();
  }, [opponentName, mutation]);

  const handleClose = useCallback(() => {
    setOpponentName("");
    setSelectedOpponent(null);
    setSearchResults([]);
    setShowDropdown(false);
    setSets([{ ...EMPTY_SET }]);
    setIWon(true);
    setPlayedAt(new Date().toISOString().slice(0, 10));
    mutation.reset();
    onClose();
  }, [onClose, mutation]);

  const canSubmit = opponentName.trim().length > 0 && !mutation.isPending;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.xl) }]}
          onPress={(e) => e.stopPropagation()}
          onStartShouldSetResponder={() => true}
        >
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Log Match Result</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Feather name="x" size={22} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Opponent */}
            <View style={styles.section}>
              <Text style={styles.label}>OPPONENT</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  placeholder="Name or search in-app players"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={opponentName}
                  onChangeText={handleOpponentNameChange}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {(selectedOpponent || opponentName.length > 0) ? (
                  <Pressable onPress={clearOpponent} hitSlop={10} style={styles.clearBtn}>
                    <Feather name="x-circle" size={18} color={Colors.dark.textMuted} />
                  </Pressable>
                ) : null}
                {isSearching ? (
                  <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginLeft: 8 }} />
                ) : null}
              </View>

              {selectedOpponent ? (
                <View style={styles.selectedBadge}>
                  <Feather name="user-check" size={14} color={Colors.dark.primary} />
                  <Text style={styles.selectedBadgeText}>{selectedOpponent.name} (in-app)</Text>
                </View>
              ) : null}

              {showDropdown && searchResults.length > 0 ? (
                <View style={styles.dropdown}>
                  {searchResults.map((p) => (
                    <Pressable
                      key={p.id}
                      style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}
                      onPress={() => selectOpponent(p)}
                    >
                      <Feather name="user" size={14} color={Colors.dark.textMuted} />
                      <Text style={styles.dropdownText}>{p.name}</Text>
                      {p.level ? (
                        <Text style={styles.dropdownLevel}>L{p.level}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Date */}
            <View style={styles.section}>
              <Text style={styles.label}>DATE PLAYED</Text>
              <TextInput
                style={styles.input}
                value={playedAt}
                onChangeText={(t) => setPlayedAt(t)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
              />
            </View>

            {/* Outcome toggle */}
            <View style={styles.section}>
              <Text style={styles.label}>OUTCOME</Text>
              <View style={styles.outcomeRow}>
                <Pressable
                  style={[styles.outcomeBtn, iWon && styles.outcomeBtnActiveWin]}
                  onPress={() => { setIWon(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={[styles.outcomeBtnText, iWon && { color: "#fff" }]}>I Won</Text>
                </Pressable>
                <Pressable
                  style={[styles.outcomeBtn, !iWon && styles.outcomeBtnActiveLoss]}
                  onPress={() => { setIWon(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={[styles.outcomeBtnText, !iWon && { color: "#fff" }]}>I Lost</Text>
                </Pressable>
              </View>
            </View>

            {/* Sets / Score */}
            <View style={styles.section}>
              <Text style={styles.label}>SCORE (OPTIONAL)</Text>
              <View style={styles.setsHeader}>
                <Text style={[styles.setsColLabel, { flex: 1 }]}>Set</Text>
                <Text style={[styles.setsColLabel, { width: 64, textAlign: "center" }]}>Me</Text>
                <Text style={[styles.setsColLabel, { width: 64, textAlign: "center" }]}>Opp</Text>
                <View style={{ width: 28 }} />
              </View>
              {sets.map((s, i) => (
                <View key={i} style={styles.setRow}>
                  <Text style={[styles.setLabel, { flex: 1 }]}>Set {i + 1}</Text>
                  <TextInput
                    style={[styles.setInput, { width: 64 }]}
                    value={s.p}
                    onChangeText={(v) => updateSet(i, "p", v)}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="0"
                    placeholderTextColor={Colors.dark.textMuted}
                    textAlign="center"
                  />
                  <TextInput
                    style={[styles.setInput, { width: 64 }]}
                    value={s.o}
                    onChangeText={(v) => updateSet(i, "o", v)}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="0"
                    placeholderTextColor={Colors.dark.textMuted}
                    textAlign="center"
                  />
                  <Pressable
                    onPress={() => removeSet(i)}
                    hitSlop={8}
                    style={[styles.removeSetBtn, sets.length === 1 && { opacity: 0.3 }]}
                    disabled={sets.length === 1}
                  >
                    <Feather name="minus-circle" size={18} color={Colors.dark.textMuted} />
                  </Pressable>
                </View>
              ))}
              {sets.length < 5 ? (
                <Pressable style={styles.addSetBtn} onPress={addSet}>
                  <Feather name="plus" size={15} color={Colors.dark.primary} />
                  <Text style={styles.addSetText}>Add Set</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Notification note */}
            {selectedOpponent ? (
              <View style={styles.noticeBox}>
                <Feather name="bell" size={14} color={Colors.dark.primary} />
                <Text style={styles.noticeText}>
                  {selectedOpponent.name} will receive a notification to confirm this result within 24 hours. It auto-confirms after that.
                </Text>
              </View>
            ) : null}

            {/* Error */}
            {mutation.isError ? (
              <Text style={styles.errorText}>
                {(mutation.error as Error)?.message ?? "Something went wrong"}
              </Text>
            ) : null}

            {/* Submit */}
            <Pressable
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {mutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Log Match</Text>
              )}
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: Spacing.lg,
    maxHeight: "92%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  inputFlex: {
    flex: 1,
  },
  input: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  clearBtn: {
    padding: Spacing.xs,
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    backgroundColor: Colors.dark.primary + "18",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  selectedBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  dropdown: {
    marginTop: 4,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  dropdownText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  dropdownLevel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  outcomeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  outcomeBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  outcomeBtnActiveWin: {
    backgroundColor: "#22c55e",
    borderColor: "#22c55e",
  },
  outcomeBtnActiveLoss: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  outcomeBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  setsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  setsColLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  setLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  setInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  removeSetBtn: {
    width: 28,
    alignItems: "center",
  },
  addSetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  addSetText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.dark.primary + "14",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 17,
  },
  errorText: {
    fontSize: 13,
    color: "#ef4444",
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  submitBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
