import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  details: string;
  type: "info" | "warning" | "error" | "success";
}

export default function AuditLogsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);

  const logs: AuditLog[] = [
    { id: "1", timestamp: "2024-12-29 08:15:32", action: "User Login", user: "thelaw", details: "Platform owner login successful", type: "success" },
    { id: "2", timestamp: "2024-12-29 08:10:15", action: "Academy Created", user: "system", details: "New academy 'Test Academy' created", type: "info" },
    { id: "3", timestamp: "2024-12-28 22:45:00", action: "XP Awarded", user: "coach_ali", details: "50 XP awarded to player_123", type: "info" },
    { id: "4", timestamp: "2024-12-28 20:30:00", action: "Settings Updated", user: "thelaw", details: "Platform billing settings modified", type: "warning" },
    { id: "5", timestamp: "2024-12-28 18:15:00", action: "Player Registered", user: "system", details: "New player registered via app", type: "success" },
    { id: "6", timestamp: "2024-12-28 15:00:00", action: "Session Cancelled", user: "coach_ali", details: "Session #456 cancelled", type: "warning" },
    { id: "7", timestamp: "2024-12-28 12:30:00", action: "API Rate Limit", user: "system", details: "Rate limit exceeded for IP 192.168.1.1", type: "error" },
    { id: "8", timestamp: "2024-12-28 10:00:00", action: "Backup Completed", user: "system", details: "Daily database backup successful", type: "success" },
  ];

  const typeConfig = {
    info: { color: Colors.dark.xpCyan, icon: "information-circle" as const },
    warning: { color: Colors.dark.orange, icon: "warning" as const },
    error: { color: Colors.dark.error, icon: "alert-circle" as const },
    success: { color: Colors.dark.primary, icon: "checkmark-circle" as const },
  };

  const filterTypes = [
    { key: null, label: "All" },
    { key: "info", label: "Info" },
    { key: "success", label: "Success" },
    { key: "warning", label: "Warning" },
    { key: "error", label: "Error" },
  ];

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType ? log.type === filterType : true;
    return matchesSearch && matchesFilter;
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Audit Logs</Text>
        <Pressable style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color={PLATFORM_COLOR} />
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.dark.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search logs..."
          placeholderTextColor={Colors.dark.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersContainer}
      >
        {filterTypes.map((filter) => (
          <Pressable
            key={filter.key || "all"}
            style={[
              styles.filterChip,
              filterType === filter.key && styles.filterChipActive
            ]}
            onPress={() => setFilterType(filter.key)}
          >
            <Text style={[
              styles.filterChipText,
              filterType === filter.key && styles.filterChipTextActive
            ]}>
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {filteredLogs.map((log) => {
          const config = typeConfig[log.type];
          return (
            <View key={log.id} style={[styles.logCard, CardStyles.elevated]}>
              <View style={styles.logHeader}>
                <View style={[styles.logIcon, { backgroundColor: `${config.color}20` }]}>
                  <Ionicons name={config.icon} size={18} color={config.color} />
                </View>
                <View style={styles.logInfo}>
                  <Text style={styles.logAction}>{log.action}</Text>
                  <Text style={styles.logTime}>{log.timestamp}</Text>
                </View>
              </View>
              <Text style={styles.logDetails}>{log.details}</Text>
              <Text style={styles.logUser}>by {log.user}</Text>
            </View>
          );
        })}

        {filteredLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No logs found</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  topBarTitle: {
    ...Typography.h2,
    color: PLATFORM_COLOR,
    flex: 1,
    textAlign: "center",
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: `${PLATFORM_COLOR}20`,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.lg,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    color: Colors.dark.text,
    ...Typography.body,
  },
  filtersScroll: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    maxHeight: 40,
  },
  filtersContainer: {
    gap: Spacing.sm,
  },
  filterChip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
  },
  filterChipActive: {
    backgroundColor: PLATFORM_COLOR,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  filterChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  logCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  logIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  logInfo: {
    flex: 1,
  },
  logAction: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  logTime: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  logDetails: {
    ...Typography.small,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  logUser: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
});
