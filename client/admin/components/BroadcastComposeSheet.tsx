import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const NEON = "#C8FF3D";

type Audience = "all_players" | "all_coaches" | "series" | "all";

interface BroadcastRecord {
  id: string;
  message: string;
  title: string;
  audience: string;
  seriesId?: string | null;
  recipient_count?: number;
  recipientCount?: number;
  tokens_sent?: number;
  tokensSent?: number;
  sent_at?: string;
  sentAt?: string;
}

interface BroadcastResult {
  success: boolean;
  recipientCount: number;
  tokensSent: number;
  broadcastId: string;
}

interface Series {
  id: string;
  title: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const AUDIENCE_OPTIONS: { value: Audience; label: string; icon: string; desc: string }[] = [
  { value: "all_players", label: "All Players", icon: "person-outline", desc: "Everyone enrolled in your academy" },
  { value: "all_coaches", label: "All Coaches", icon: "people-outline", desc: "All coaches in your academy" },
  { value: "all", label: "Everyone", icon: "globe-outline", desc: "Players + coaches in your academy" },
  { value: "series", label: "Specific Series", icon: "albums-outline", desc: "Players in a coaching series" },
];

function formatBroadcastDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return dateStr;
  }
}

export function BroadcastComposeSheet({ visible, onClose }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("Academy Announcement");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("all_players");
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [showSeries, setShowSeries] = useState(false);
  const [deliverySummary, setDeliverySummary] = useState<string | null>(null);

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: [`/api/admin/broadcast/recipient-count?audience=${audience}${audience === "series" && selectedSeriesId ? `&seriesId=${selectedSeriesId}` : ""}`],
    enabled: visible,
  });

  const { data: historyData } = useQuery<{ broadcasts: BroadcastRecord[] }>({
    queryKey: ["/api/admin/broadcast/history"],
    enabled: visible,
  });

  const { data: seriesData } = useQuery<Series[]>({
    queryKey: ["/api/coach/series"],
    enabled: visible && audience === "series",
  });

  const broadcastMutation = useMutation<BroadcastResult, Error, object>({
    mutationFn: async (body: object) => {
      const res = await apiRequest("POST", "/api/admin/broadcast", body);
      return res.json() as Promise<BroadcastResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/broadcast/history"] });
      setMessage("");
      setTitle("Academy Announcement");
      const { tokensSent, recipientCount } = data;
      const deliveryLine =
        tokensSent > 0
          ? `${tokensSent} of ${recipientCount} device${recipientCount === 1 ? "" : "s"} received the notification.`
          : recipientCount > 0
          ? `${recipientCount} recipient${recipientCount === 1 ? "" : "s"} — no active devices found.`
          : "No recipients in this audience.";
      if (Platform.OS === "web") {
        setDeliverySummary(deliveryLine);
        setTimeout(() => setDeliverySummary(null), 5000);
      } else {
        Alert.alert("Broadcast Sent", deliveryLine);
      }
    },
    onError: (e: Error) => Alert.alert("Error", e.message || "Failed to send broadcast"),
  });

  const broadcasts = historyData?.broadcasts ?? [];
  const recipientCount = countData?.count ?? 0;
  const seriesList = seriesData ?? [];

  const handleSend = () => {
    if (!message.trim()) {
      Alert.alert("Error", "Please write a message before sending.");
      return;
    }
    if (audience === "series" && !selectedSeriesId) {
      Alert.alert("Error", "Please select a series.");
      return;
    }

    const confirmMsg = `Send to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}?`;
    if (Platform.OS === "web") {
      if (!window.confirm(confirmMsg)) return;
      broadcastMutation.mutate({
        message: message.trim(),
        title: title.trim() || "Academy Announcement",
        audience,
        seriesId: audience === "series" ? selectedSeriesId : null,
      });
    } else {
      Alert.alert("Confirm Broadcast", confirmMsg, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () =>
            broadcastMutation.mutate({
              message: message.trim(),
              title: title.trim() || "Academy Announcement",
              audience,
              seriesId: audience === "series" ? selectedSeriesId : null,
            }),
        },
      ]);
    }
  };

  const content = (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="megaphone" size={18} color={NEON} />
          </View>
          <Text style={styles.headerTitle}>Broadcast Message</Text>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Compose */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compose</Text>

          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Academy Announcement"
            placeholderTextColor={Colors.dark.textMuted}
          />

          <Text style={styles.fieldLabel}>Message</Text>
          <TextInput
            style={[styles.textInput, styles.messageInput]}
            value={message}
            onChangeText={setMessage}
            placeholder="Write your message to players and coaches..."
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{message.length}/500</Text>
        </View>

        {/* Audience */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audience</Text>
          <View style={styles.audienceGrid}>
            {AUDIENCE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.audienceCard, audience === opt.value && styles.audienceCardActive]}
                onPress={() => {
                  setAudience(opt.value);
                  if (opt.value === "series") setShowSeries(true);
                  else setShowSeries(false);
                }}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={20}
                  color={audience === opt.value ? NEON : Colors.dark.textMuted}
                />
                <Text style={[styles.audienceLabel, audience === opt.value && styles.audienceLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={styles.audienceDesc}>{opt.desc}</Text>
              </Pressable>
            ))}
          </View>

          {audience === "series" && (
            <View style={styles.seriesList}>
              <Text style={styles.fieldLabel}>Select Series</Text>
              {seriesList.length === 0 ? (
                <Text style={styles.emptyText}>No series available</Text>
              ) : (
                seriesList.map((s) => (
                  <Pressable
                    key={s.id}
                    style={[styles.seriesRow, selectedSeriesId === s.id && styles.seriesRowActive]}
                    onPress={() => setSelectedSeriesId(s.id)}
                  >
                    <Ionicons name="albums-outline" size={16} color={selectedSeriesId === s.id ? NEON : Colors.dark.textMuted} />
                    <Text style={[styles.seriesName, selectedSeriesId === s.id && styles.seriesNameActive]}>
                      {s.title}
                    </Text>
                    {selectedSeriesId === s.id && (
                      <Ionicons name="checkmark-circle" size={16} color={NEON} />
                    )}
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>

        {/* Recipient count + Send */}
        <View style={styles.sendSection}>
          <View style={styles.recipientInfo}>
            <Ionicons name="people-outline" size={16} color={NEON} />
            <Text style={styles.recipientText}>
              {recipientCount} recipient{recipientCount === 1 ? "" : "s"} will receive this message
            </Text>
          </View>
          <Pressable
            style={[styles.sendBtn, (broadcastMutation.isPending || !message.trim()) && styles.sendBtnDisabled]}
            onPress={handleSend}
          >
            {broadcastMutation.isPending ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#000" />
                <Text style={styles.sendBtnText}>Send Broadcast</Text>
              </>
            )}
          </Pressable>

          {deliverySummary != null && (
            <View style={styles.deliveryBanner}>
              <Ionicons name="checkmark-circle" size={14} color={NEON} />
              <Text style={styles.deliveryBannerText}>{deliverySummary}</Text>
            </View>
          )}
        </View>

        {/* History */}
        {broadcasts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Broadcast History</Text>
            {broadcasts.map((b) => (
              <View key={b.id} style={styles.historyCard}>
                <View style={styles.historyCardHeader}>
                  <Text style={styles.historyTitle} numberOfLines={1}>{b.title}</Text>
                  <Text style={styles.historyDate}>
                    {formatBroadcastDate(b.sent_at ?? b.sentAt)}
                  </Text>
                </View>
                <Text style={styles.historyMessage} numberOfLines={2}>{b.message}</Text>
                <View style={styles.historyMeta}>
                  <View style={styles.historyMetaItem}>
                    <Ionicons name="phone-portrait-outline" size={12} color={Colors.dark.textMuted} />
                    <Text style={styles.historyMetaText}>
                      {(() => {
                        const sent = b.tokens_sent ?? b.tokensSent;
                        const total = b.recipient_count ?? b.recipientCount ?? 0;
                        if (sent != null) {
                          return `${sent} of ${total} devices delivered`;
                        }
                        return `${total} recipient${total === 1 ? "" : "s"}`;
                      })()}
                    </Text>
                  </View>
                  <View style={styles.historyBadge}>
                    <Text style={styles.historyBadgeText}>
                      {b.audience === "all_players" ? "Players" :
                        b.audience === "all_coaches" ? "Coaches" :
                        b.audience === "series" ? "Series" : "Everyone"}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );

  if (Platform.OS === "web") {
    if (!visible) return null;
    return (
      <View style={styles.webPanelOverlay} pointerEvents="box-none">
        <Pressable style={styles.webBackdrop} onPress={onClose} />
        <View style={styles.webPanel}>{content}</View>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mobileOverlay} onPress={onClose}>
        <Pressable style={styles.mobileSheet} onPress={(e) => e.stopPropagation()}>
          {content}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#161A1F",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(200,255,61,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: "700",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  fieldLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 2,
  },
  textInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: Colors.dark.text,
    fontSize: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  messageInput: {
    minHeight: 100,
    paddingTop: 10,
  },
  charCount: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    textAlign: "right",
    marginTop: 4,
  },
  audienceGrid: {
    gap: 8,
  },
  audienceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: Spacing.sm,
  },
  audienceCardActive: {
    backgroundColor: "rgba(200,255,61,0.06)",
    borderColor: "rgba(200,255,61,0.25)",
  },
  audienceLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  audienceLabelActive: {
    color: NEON,
  },
  audienceDesc: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    flex: 2,
    textAlign: "right",
  },
  seriesList: {
    marginTop: Spacing.md,
  },
  seriesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  seriesRowActive: {
    backgroundColor: "rgba(200,255,61,0.06)",
  },
  seriesName: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  seriesNameActive: {
    color: NEON,
    fontWeight: "600",
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontStyle: "italic",
  },
  sendSection: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  recipientInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(200,255,61,0.06)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.15)",
  },
  recipientText: {
    color: NEON,
    fontSize: 13,
    fontWeight: "600",
  },
  deliveryBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(200,255,61,0.08)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.2)",
  },
  deliveryBannerText: {
    color: NEON,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: NEON,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  historyCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  historyCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  historyTitle: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  historyDate: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  historyMessage: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  historyMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  historyMetaText: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  historyBadge: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  historyBadgeText: {
    color: Colors.dark.textMuted,
    fontSize: 10,
    fontWeight: "600",
  },
  // Web layout
  webPanelOverlay: {
    position: "absolute" as any,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    zIndex: 999,
  },
  webBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  webPanel: {
    width: 420,
    backgroundColor: "#161A1F",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.07)",
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  // Mobile layout
  mobileOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  mobileSheet: {
    height: "90%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
});
