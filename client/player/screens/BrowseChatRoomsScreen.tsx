import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface ChatRoom {
  id: string;
  scope: string;
  countryCode: string | null;
  title: string;
  flag: string | null;
}

export default function BrowseChatRoomsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState("");

  const { data: rooms = [], isLoading } = useQuery<ChatRoom[]>({
    queryKey: ["/api/chat-rooms/browse"],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.countryCode || "").toLowerCase().includes(q),
    );
  }, [rooms, search]);

  const renderRoom = ({ item }: { item: ChatRoom }) => (
    <Pressable
      style={styles.roomRow}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("ChatRoom", { roomId: item.id, title: item.title });
      }}
    >
      <View style={styles.flagBox}>
        <Text style={styles.flagTxt}>{item.flag || "🌍"}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.roomTitle}>{item.title}</Text>
        <Text style={styles.roomSub}>
          {item.scope === "world" ? "Global · all players" : `Country chat${item.countryCode ? ` · ${item.countryCode}` : ""}`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Browse rooms</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={Colors.dark.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by country or name"
          placeholderTextColor={Colors.dark.textMuted}
          style={styles.searchInput}
        />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          renderItem={renderRoom}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTxt}>No rooms found</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...Typography.h3, color: Colors.dark.text },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.chipBackground,
    margin: Spacing.lg,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    gap: 8,
  },
  searchInput: { flex: 1, color: Colors.dark.text, paddingVertical: 10, ...Typography.body },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    gap: Spacing.md,
  },
  flagBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.chipBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  flagTxt: { fontSize: 22 },
  roomTitle: { ...Typography.body, color: Colors.dark.text, fontWeight: "600" },
  roomSub: { ...Typography.caption, color: Colors.dark.textMuted, marginTop: 2 },
  sep: { height: 1, backgroundColor: Colors.dark.chipBackground, marginLeft: 72 },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyTxt: { color: Colors.dark.textMuted },
});
