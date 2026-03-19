import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl } from "@/lib/query-client";
import { getPrimarySpecialization } from "@/provider/constants/specializations";

interface ClientRow {
  player: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    level: number;
  };
  totalSessions: number;
  lastVisit: string | null;
  notesCount: number;
  latestNote: string | null;
  preferences: Record<string, unknown>;
}

interface ProviderProfile {
  specializations: string[];
}

function PlayerAvatar({ uri, size }: { uri: string | null; size: number }) {
  if (!uri) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: Colors.dark.backgroundSecondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="person" size={size * 0.5} color={Colors.dark.textSecondary} />
      </View>
    );
  }
  const fullUri = uri.startsWith("/") ? getStaticAssetsUrl() + uri : uri;
  return (
    <Image
      source={{ uri: fullUri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ClientCard({ item, onPress }: { item: ClientRow; onPress: () => void }) {
  const hasData = item.notesCount > 0 || Object.keys(item.preferences).length > 0;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <PlayerAvatar uri={item.player.profilePhotoUrl ?? null} size={46} />
      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.player.name}
          </Text>
          {item.player.level ? (
            <View style={styles.levelPill}>
              <Text style={styles.levelPillText}>Lv.{item.player.level}</Text>
            </View>
          ) : null}
          {hasData ? (
            <Ionicons name="document-text-outline" size={13} color={Colors.dark.primary} />
          ) : null}
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.totalSessions} {item.totalSessions === 1 ? "session" : "sessions"} · last seen{" "}
          {formatLastSeen(item.lastVisit)}
        </Text>
        {item.latestNote ? (
          <Text style={styles.cardNote} numberOfLines={1}>
            {item.latestNote}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.dark.textSecondary} />
    </Pressable>
  );
}

function emptyTitle(spec: string): string {
  if (spec === "stringing") return "Your client book is empty.\nStart stringing!";
  if (spec === "physio") return "Your client book is empty.\nStart treating!";
  if (spec === "fitness") return "Your client book is empty.\nStart training!";
  if (spec === "nutrition") return "Your client book is empty.\nStart coaching!";
  return "Your client book is empty.\nGet your first booking!";
}

export default function ProviderClientsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState("");

  const { data: profile } = useQuery<ProviderProfile>({ queryKey: ["/api/provider/me"] });
  const { data: clients = [], isLoading, refetch } = useQuery<ClientRow[]>({
    queryKey: ["/api/provider/clients"],
  });

  const spec = getPrimarySpecialization(profile?.specializations ?? []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => c.player.name.toLowerCase().includes(q));
  }, [clients, search]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Clients</Text>
        <Text style={styles.headerCount}>
          {clients.length} {clients.length === 1 ? "client" : "clients"}
        </Text>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={Colors.dark.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients..."
          placeholderTextColor={Colors.dark.textSecondary}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {!isLoading && filtered.length === 0 ? (
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.emptyState}>
          <View style={styles.iconCircle}>
            <Ionicons name="book-outline" size={40} color={Colors.dark.primary} />
          </View>
          <Text style={styles.emptyTitle}>{emptyTitle(spec)}</Text>
          <Text style={styles.emptySubtitle}>
            Clients appear here after their first booking with you.
          </Text>
        </Animated.View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.player.id}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(index * 40).duration(300)}>
              <ClientCard
                item={item}
                onPress={() =>
                  navigation.navigate("ProviderClientDetail", { playerId: item.player.id })
                }
              />
            </Animated.View>
          )}
          contentContainerStyle={{
            paddingHorizontal: Spacing.md,
            paddingBottom: insets.bottom + 80,
            gap: Spacing.sm,
          }}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
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
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: Colors.dark.text },
  headerCount: { fontSize: 13, color: Colors.dark.textSecondary },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    height: 40,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F141B",
    borderRadius: 14,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  cardBody: { flex: 1, gap: 3 },
  cardNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { fontSize: 15, fontWeight: "600", color: Colors.dark.text, flex: 1 },
  levelPill: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  levelPillText: { fontSize: 10, fontWeight: "700", color: Colors.dark.primary },
  cardMeta: { fontSize: 12, color: Colors.dark.textSecondary },
  cardNote: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    lineHeight: 26,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
});
