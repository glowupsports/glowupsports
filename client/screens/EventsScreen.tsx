import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  type: "tournament" | "lesson" | "practice" | "social";
  location: string;
  registered: boolean;
}

const EVENTS: CalendarEvent[] = [
  { id: "1", title: "Weekly Tournament", date: "Dec 22", time: "2:00 PM", type: "tournament", location: "Center Court", registered: true },
  { id: "2", title: "Group Lesson: Serve Mastery", date: "Dec 23", time: "10:00 AM", type: "lesson", location: "Court 3", registered: false },
  { id: "3", title: "Practice Session", date: "Dec 24", time: "4:00 PM", type: "practice", location: "Court 1", registered: true },
  { id: "4", title: "Holiday Social Match", date: "Dec 25", time: "11:00 AM", type: "social", location: "All Courts", registered: false },
  { id: "5", title: "New Year Tournament", date: "Jan 1", time: "3:00 PM", type: "tournament", location: "Center Court", registered: false },
];

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const getTypeIcon = (type: CalendarEvent["type"]): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case "tournament": return "ribbon-outline";
      case "lesson": return "book-outline";
      case "practice": return "locate-outline";
      case "social": return "people-outline";
    }
  };

  const getTypeColor = (type: CalendarEvent["type"]) => {
    switch (type) {
      case "tournament": return Colors.dark.gold;
      case "lesson": return Colors.dark.xpCyan;
      case "practice": return Colors.dark.primary;
      case "social": return Colors.dark.orange;
    }
  };

  const renderEvent = ({ item }: { item: CalendarEvent }) => (
    <Card style={styles.eventCard}>
      <View style={styles.eventHeader}>
        <View style={[styles.typeIcon, { backgroundColor: getTypeColor(item.type) }]}>
          <Ionicons name={getTypeIcon(item.type)} size={20} color={Colors.dark.buttonText} />
        </View>
        <View style={styles.eventInfo}>
          <ThemedText style={styles.eventTitle}>{item.title}</ThemedText>
          <View style={styles.eventMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={Colors.dark.text} />
              <ThemedText style={styles.metaText}>{item.date}</ThemedText>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={Colors.dark.text} />
              <ThemedText style={styles.metaText}>{item.time}</ThemedText>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.eventFooter}>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color={Colors.dark.text} />
          <ThemedText style={styles.locationText}>{item.location}</ThemedText>
        </View>
        <Pressable
          style={[
            styles.registerButton,
            item.registered && styles.registeredButton,
          ]}
        >
          {item.registered ? (
            <>
              <Ionicons name="checkmark-outline" size={14} color={Colors.dark.buttonText} />
              <ThemedText style={styles.registerText}>Registered</ThemedText>
            </>
          ) : (
            <ThemedText style={styles.registerText}>Register</ThemedText>
          )}
        </Pressable>
      </View>
    </Card>
  );

  return (
    <FlatList
      data={EVENTS}
      keyExtractor={(item) => item.id}
      renderItem={renderEvent}
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        gap: Spacing.md,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      ListHeaderComponent={
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Upcoming Events</ThemedText>
          <Pressable style={styles.calendarToggle}>
            <Ionicons name="calendar-outline" size={18} color={Colors.dark.primary} />
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  calendarToggle: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  eventCard: {
    padding: Spacing.lg,
  },
  eventHeader: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  eventMeta: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  eventFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  registeredButton: {
    backgroundColor: Colors.dark.successNeon,
  },
  registerText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
});
