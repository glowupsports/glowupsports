import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useWebSocket } from "@/lib/useWebSocket";

interface ChatRoom {
  id: string;
  scope: string;
  countryCode: string | null;
  title: string;
  flag: string | null;
  mutedAt: string | null;
}

interface RoomMessage {
  id: string;
  body: string;
  messageType: string | null;
  createdAt: string;
  senderType: string | null;
  senderCoachId: string | null;
  senderPlayerId: string | null;
  senderName?: string;
  senderPhotoUrl?: string | null;
  senderCountry?: string | null;
  senderFlag?: string | null;
  academyName?: string;
  reactions?: Array<{ id: string; emoji: string; reactorPlayerId: string | null; reactorCoachId: string | null }>;
  isPinned?: boolean;
}

const REACTIONS = ["👍", "❤️", "🔥", "🎾", "🏆"];

function renderWithMentions(body: string, baseStyle: any, mentionStyle: any) {
  const parts = body.split(/(@[\w][\w._-]{1,30})/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") && part.length > 1) {
      return (
        <Text key={i} style={mentionStyle}>
          {part}
        </Text>
      );
    }
    return (
      <Text key={i} style={baseStyle}>
        {part}
      </Text>
    );
  });
}

function parseMatchInvite(body: string): null | {
  title: string;
  date: string;
  time?: string;
  location?: string;
  sport?: string;
  level?: string;
} {
  if (!body.startsWith("[match_invite]")) return null;
  try {
    return JSON.parse(body.slice("[match_invite]".length));
  } catch {
    return null;
  }
}

export default function ChatRoomScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const roomId: string = route.params?.roomId;
  const initialTitle: string = route.params?.title || "Room";
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [pinPromo, setPinPromo] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const { data: room } = useQuery<ChatRoom>({
    queryKey: ["/api/chat-rooms", roomId],
  });

  const { data: messages = [], isLoading } = useQuery<RoomMessage[]>({
    queryKey: ["/api/chat-rooms", roomId, "messages"],
    refetchInterval: 8000,
  });

  // Live updates via WS
  useWebSocket({
    onWorldMessage: (payload) => {
      const p = payload as { kind?: string; roomId?: string } | null;
      if (p && (p.kind === "chat_room_message" || p.kind === "chat_room_reaction") && p.roomId === roomId) {
        queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms", roomId, "messages"] });
        queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms"] });
      }
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/chat-rooms/${roomId}/messages`, payload);
      return res.json();
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms", roomId, "messages"] });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onError: (e: any) => {
      Alert.alert("Could not send", e?.message || "Try again");
    },
  });

  const reactMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await apiRequest("POST", `/api/chat-rooms/messages/${messageId}/reactions`, { emoji });
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms", roomId, "messages"] }),
  });

  const muteMutation = useMutation({
    mutationFn: async (hours: number | null) => {
      if (hours === null) {
        await apiRequest("DELETE", `/api/chat-rooms/${roomId}/mute`);
      } else {
        await apiRequest("POST", `/api/chat-rooms/${roomId}/mute`, { hours });
      }
    },
  });

  const reportMutation = useMutation({
    mutationFn: async ({ messageId, reason }: { messageId: string; reason: string }) => {
      await apiRequest("POST", `/api/chat-rooms/messages/${messageId}/report`, { reason });
    },
    onSuccess: () => Alert.alert("Reported", "Thanks — our team will review."),
  });

  const recentSenders = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = messages.length - 1; i >= 0 && map.size < 12; i--) {
      const m = messages[i];
      if (m.senderName) {
        const key = m.senderName.replace(/\s+/g, "");
        if (!map.has(key)) map.set(key, m.senderName);
      }
    }
    return Array.from(map.entries()); // [handle, displayName]
  }, [messages]);

  const handleTextChange = useCallback((newText: string) => {
    setText(newText);
    // Detect @mention typing: last token starts with @
    const match = newText.match(/(?:^|\s)@(\w*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  }, []);

  const insertMention = useCallback(
    (handle: string) => {
      const replaced = text.replace(/(?:^|\s)@(\w*)$/, (m) => {
        const lead = m.startsWith(" ") ? " " : "";
        return `${lead}@${handle} `;
      });
      setText(replaced);
      setMentionQuery(null);
    },
    [text],
  );

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const mentions = Array.from(text.matchAll(/@([\w][\w._-]{1,30})/g)).map((m) => m[1]);
    sendMutation.mutate({
      body: text.trim(),
      messageType: "text",
      mentions,
      pinPromo: pinPromo || undefined,
    });
    setPinPromo(false);
    setMentionQuery(null);
  }, [text, sendMutation, pinPromo]);

  const handleLongPress = useCallback(
    (msg: RoomMessage) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const buttons: any[] = REACTIONS.map((emoji) => ({
        text: emoji,
        onPress: () => reactMutation.mutate({ messageId: msg.id, emoji }),
      }));
      buttons.push({
        text: "Report message",
        style: "destructive",
        onPress: () =>
          reportMutation.mutate({ messageId: msg.id, reason: "Inappropriate content" }),
      });
      buttons.push({ text: "Cancel", style: "cancel" });
      Alert.alert("Message", msg.senderName || "", buttons);
    },
    [reactMutation, reportMutation],
  );

  const handleMuteUser = useCallback(() => {
    Alert.alert("Mute this room", "How long?", [
      { text: "1 hour", onPress: () => muteMutation.mutate(1) },
      { text: "24 hours", onPress: () => muteMutation.mutate(24) },
      { text: "Forever", onPress: () => muteMutation.mutate(0) },
      { text: "Unmute", onPress: () => muteMutation.mutate(null) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [muteMutation]);

  const renderMessage = ({ item }: { item: RoomMessage }) => {
    const invite = item.messageType === "match_invite" ? parseMatchInvite(item.body) : null;
    const isCoach = item.senderType === "coach";
    return (
      <Pressable onLongPress={() => handleLongPress(item)} style={styles.messageRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>
            {item.senderFlag || (isCoach ? "🎾" : "👤")}
          </Text>
        </View>
        <View style={styles.messageBody}>
          <View style={styles.messageHeader}>
            <Text style={styles.senderName} numberOfLines={1}>
              {item.senderName || "Player"}
              {isCoach ? " · Coach" : ""}
            </Text>
            {item.academyName ? (
              <Text style={styles.academyName} numberOfLines={1}>
                {item.academyName}
              </Text>
            ) : null}
          </View>
          {item.isPinned ? (
            <View style={styles.pinnedBadge}>
              <Ionicons name="pin" size={11} color="#FBBF24" />
              <Text style={styles.pinnedText}>Pinned this week</Text>
            </View>
          ) : null}
          {invite ? (
            <View style={styles.inviteCard}>
              <View style={styles.inviteHeader}>
                <Ionicons name="tennisball" size={14} color={Colors.dark.primary} />
                <Text style={styles.inviteTitle}>{invite.title}</Text>
              </View>
              <Text style={styles.inviteMeta}>
                {invite.date}
                {invite.time ? ` · ${invite.time}` : ""}
                {invite.location ? ` · ${invite.location}` : ""}
              </Text>
              {invite.level ? <Text style={styles.inviteMeta}>Level: {invite.level}</Text> : null}
              <Pressable
                style={styles.inviteBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("PlayerTabs", {
                    screen: "PlayStack",
                    params: { screen: "CreateMatch" },
                  });
                }}
              >
                <Text style={styles.inviteBtnTxt}>I'm in</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.messageText}>
              {renderWithMentions(item.body, styles.messageText, styles.mentionText)}
            </Text>
          )}
          {item.reactions && item.reactions.length > 0 ? (
            <View style={styles.reactionsRow}>
              {Object.entries(
                item.reactions.reduce<Record<string, number>>((acc, r) => {
                  acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                  return acc;
                }, {}),
              ).map(([emoji, count]) => (
                <View key={emoji} style={styles.reactionChip}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={styles.reactionCount}>{count}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {room?.flag ? `${room.flag} ` : ""}
            {room?.title || initialTitle}
          </Text>
          <Text style={styles.headerSubtitle}>
            {room?.scope === "world" ? "Global chat · all players" : "Country chat"}
          </Text>
        </View>
        <Pressable onPress={handleMuteUser} style={styles.iconBtn}>
          <Ionicons name="notifications-off-outline" size={20} color={Colors.dark.text} />
        </Pressable>
      </View>

      {room?.mutedAt ? (
        <View style={styles.mutedBanner}>
          <Ionicons name="lock-closed" size={14} color="#fff" />
          <Text style={styles.mutedBannerText}>
            This room is muted by a moderator.
          </Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.listContent, { paddingBottom: 12 }]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={36} color={Colors.dark.textMuted} />
              <Text style={styles.emptyTxt}>Be the first to say hi!</Text>
            </View>
          }
        />
      )}

      {mentionQuery !== null && recentSenders.length > 0 ? (
        <View style={styles.mentionDropdown}>
          <FlatList
            data={recentSenders.filter(([h]) => h.toLowerCase().includes(mentionQuery))}
            keyExtractor={([h]) => h}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: [handle, name] }) => (
              <Pressable style={styles.mentionItem} onPress={() => insertMention(handle)}>
                <Ionicons name="at" size={14} color={Colors.dark.primary} />
                <Text style={styles.mentionItemTxt}>{name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.mentionItem}>
                <Text style={styles.mentionItemTxt}>No matches</Text>
              </View>
            }
          />
        </View>
      ) : null}
      {room?.scope === "country" ? (
        <View style={{ flexDirection: "row", paddingHorizontal: Spacing.sm, paddingTop: 4 }}>
          <Pressable
            onPress={() => {
              setPinPromo((v) => !v);
              Haptics.selectionAsync();
            }}
            style={[styles.pinToggle, pinPromo && styles.pinToggleActive]}
          >
            <Ionicons name="pin" size={12} color={pinPromo ? "#FBBF24" : Colors.dark.textSecondary} />
            <Text style={[styles.pinToggleTxt, pinPromo && styles.pinToggleTxtActive]}>
              Pin promo (coaches, 1/week)
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable
          style={styles.actionBtn}
          onPress={() => setShowInvite(true)}
          accessibilityLabel="Invite to match"
        >
          <Ionicons name="add-circle" size={26} color={Colors.dark.primary} />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Send a message…  Type @ to mention"
          placeholderTextColor={Colors.dark.textMuted}
          value={text}
          onChangeText={handleTextChange}
          multiline
          maxLength={2000}
        />
        <Pressable
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sendMutation.isPending}
        >
          <Ionicons name="send" size={18} color="#000" />
        </Pressable>
      </View>

      <MatchInviteModal
        visible={showInvite}
        onClose={() => setShowInvite(false)}
        onSubmit={(payload) => {
          setShowInvite(false);
          sendMutation.mutate({
            body: `Looking for a match: ${payload.title}`,
            messageType: "match_invite",
            matchInvite: payload,
          });
        }}
      />
    </View>
  );
}

function MatchInviteModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (p: { title: string; date: string; time?: string; location?: string; level?: string }) => void;
}) {
  const [title, setTitle] = useState("Looking for a match");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [level, setLevel] = useState("");
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Invite to a match</Text>
          <Text style={styles.modalLabel}>What kind?</Text>
          <TextInput style={styles.modalInput} value={title} onChangeText={setTitle} placeholder="Friendly singles" placeholderTextColor={Colors.dark.textMuted} />
          <Text style={styles.modalLabel}>When</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[styles.modalInput, { flex: 1 }]} value={date} onChangeText={setDate} placeholder="Sat May 3" placeholderTextColor={Colors.dark.textMuted} />
            <TextInput style={[styles.modalInput, { flex: 1 }]} value={time} onChangeText={setTime} placeholder="18:00" placeholderTextColor={Colors.dark.textMuted} />
          </View>
          <Text style={styles.modalLabel}>Where</Text>
          <TextInput style={styles.modalInput} value={location} onChangeText={setLocation} placeholder="Court / area" placeholderTextColor={Colors.dark.textMuted} />
          <Text style={styles.modalLabel}>Level (optional)</Text>
          <TextInput style={styles.modalInput} value={level} onChangeText={setLevel} placeholder="Green / Yellow / 4.0" placeholderTextColor={Colors.dark.textMuted} />
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.modalBtn, styles.modalCancel]}>
              <Text style={styles.modalCancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!date.trim()) {
                  Alert.alert("Date required");
                  return;
                }
                onSubmit({ title: title || "Looking for a match", date, time: time || undefined, location: location || undefined, level: level || undefined });
              }}
              style={[styles.modalBtn, styles.modalPost]}
            >
              <Text style={styles.modalPostTxt}>Post invite</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
    gap: Spacing.sm,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { ...Typography.h3, color: Colors.dark.text },
  headerSubtitle: { ...Typography.caption, color: Colors.dark.textMuted, marginTop: 2 },
  mutedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: "#7F1D1D",
  },
  mutedBannerText: { color: "#fff", fontSize: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTxt: { color: Colors.dark.textMuted, ...Typography.body },
  messageRow: { flexDirection: "row", marginBottom: Spacing.md, gap: Spacing.sm },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.chipBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { fontSize: 18 },
  messageBody: { flex: 1 },
  messageHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  senderName: { ...Typography.caption, color: Colors.dark.text, fontWeight: "600", maxWidth: "55%" },
  academyName: { ...Typography.caption, color: Colors.dark.textMuted, flex: 1 },
  pinnedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  pinnedText: { fontSize: 11, color: "#FBBF24", fontWeight: "600" },
  messageText: { ...Typography.body, color: Colors.dark.text },
  mentionText: { ...Typography.body, color: Colors.dark.primary, fontWeight: "600" },
  mentionDropdown: {
    position: "absolute",
    bottom: 60,
    left: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    maxHeight: 180,
    paddingVertical: 4,
  },
  mentionItem: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  mentionItemTxt: { color: Colors.dark.text, ...Typography.body },
  pinToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.full,
    marginRight: 6,
  },
  pinToggleActive: { backgroundColor: "#FBBF2433", borderWidth: 1, borderColor: "#FBBF24" },
  pinToggleTxt: { color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" },
  pinToggleTxtActive: { color: "#FBBF24" },
  reactionsRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.chipBackground,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: Colors.dark.text, fontWeight: "600" },
  inviteCard: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "55",
  },
  inviteHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  inviteTitle: { ...Typography.body, color: Colors.dark.text, fontWeight: "600" },
  inviteMeta: { ...Typography.caption, color: Colors.dark.textSecondary, marginTop: 2 },
  inviteBtn: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    marginTop: 10,
    alignItems: "center",
  },
  inviteBtnTxt: { color: "#000", fontWeight: "700", ...Typography.body },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.sm,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.chipBackground,
    gap: 6,
  },
  actionBtn: { paddingHorizontal: 4, paddingVertical: 6 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    color: Colors.dark.text,
    ...Typography.body,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.lg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 6,
  },
  modalTitle: { ...Typography.h3, color: Colors.dark.text, marginBottom: 8 },
  modalLabel: { ...Typography.caption, color: Colors.dark.textMuted, marginTop: 8 },
  modalInput: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.dark.text,
    ...Typography.body,
  },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  modalBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: BorderRadius.md },
  modalCancel: { backgroundColor: Colors.dark.chipBackground },
  modalCancelTxt: { color: Colors.dark.text, fontWeight: "600" },
  modalPost: { backgroundColor: Colors.dark.primary },
  modalPostTxt: { color: "#000", fontWeight: "700" },
});
