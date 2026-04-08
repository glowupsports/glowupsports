import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import type { MergeSuggestion } from "./types";

interface SeriesSmartFillModalProps {
  visible: boolean;
  onClose: () => void;
  loadingSuggestions: boolean;
  mergeSuggestions: { suggestions: MergeSuggestion[]; openSlots: number } | undefined;
  getBallLevelColor: (level?: string) => string;
  formatDate: (date: string | Date) => string;
  getDefaultGuestUntil: () => Date;
  onSelectSuggestion: (playerId: string, guestEnd: Date) => void;
  bottomInset: number;
}

export function SeriesSmartFillModal({
  visible,
  onClose,
  loadingSuggestions,
  mergeSuggestions,
  getBallLevelColor,
  formatDate,
  getDefaultGuestUntil,
  onSelectSuggestion,
  bottomInset,
}: SeriesSmartFillModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.drawer, { paddingBottom: bottomInset + Spacing.md }]}>
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>
          <View style={styles.addPlayerHeader}>
            <View>
              <Text style={styles.addPlayerTitle}>Smart Fill</Text>
              <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 }}>
                Players on holiday from other groups
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.addPlayerContent} contentContainerStyle={{ paddingBottom: 40 }}>
            {loadingSuggestions ? (
              <View style={{ alignItems: "center", padding: Spacing.xl }}>
                <ActivityIndicator size="large" color={Colors.dark.orange} />
                <Text style={{ color: Colors.dark.textMuted, marginTop: Spacing.md }}>Finding available players...</Text>
              </View>
            ) : !mergeSuggestions?.suggestions?.length ? (
              <View style={{ alignItems: "center", padding: Spacing.xl }}>
                <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={{ color: Colors.dark.textMuted, marginTop: Spacing.md, textAlign: "center" }}>
                  No players on holiday from other groups right now
                </Text>
              </View>
            ) : (
              <>
                <Text style={{ color: Colors.dark.orange, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, marginBottom: Spacing.md }}>
                  {mergeSuggestions.suggestions.length} available ({mergeSuggestions.openSlots} open slots)
                </Text>
                {mergeSuggestions.suggestions.map((suggestion) => {
                  const ballColor = getBallLevelColor(suggestion.ballLevel);
                  return (
                    <View key={suggestion.playerId} style={styles.smartFillCard}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <View style={[styles.playerAvatar, { backgroundColor: ballColor + "30", borderWidth: 2, borderColor: ballColor, width: 36, height: 36 }]}>
                          <Text style={[styles.playerInitial, { color: ballColor, fontSize: 14 }]}>
                            {suggestion.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ marginLeft: Spacing.md, flex: 1 }}>
                          <Text style={styles.playerName}>{suggestion.name}</Text>
                          <Text style={{ fontSize: 11, color: Colors.dark.textMuted }}>
                            From: {suggestion.homeSeriesName}
                          </Text>
                          {suggestion.pauseFrom && suggestion.pauseUntil ? (
                            <Text style={{ fontSize: 11, color: Colors.dark.orange }}>
                              Holiday: {formatDate(suggestion.pauseFrom)} - {formatDate(suggestion.pauseUntil)}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Pressable
                        style={styles.smartFillAddBtn}
                        onPress={() => {
                          const guestEnd = suggestion.pauseUntil ? new Date(suggestion.pauseUntil) : getDefaultGuestUntil();
                          onSelectSuggestion(suggestion.playerId, guestEnd);
                        }}
                      >
                        <Ionicons name="add" size={16} color={Colors.dark.buttonText} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.dark.buttonText }}>Add as Guest</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
