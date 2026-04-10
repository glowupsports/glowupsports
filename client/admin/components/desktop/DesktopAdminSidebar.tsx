import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";

export type DesktopAdminRoute =
  | "AdminDashboard"
  | "AdminSchedule"
  | "AdminPlayers"
  | "AdminCoaches"
  | "AdminRolesPermissions"
  | "AdminPayments"
  | "AdminSubscriptions"
  | "AdminReports"
  | "AdminFinance"
  | "AdminCourts"
  | "AdminClasses"
  | "AdminSettings";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

interface NavItem {
  route: DesktopAdminRoute;
  label: string;
  icon: IoniconName;
  ownerOnly?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
  ownerOnly?: boolean;
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "OPERATIONS",
    items: [
      { route: "AdminDashboard", label: "Dashboard", icon: "grid-outline" },
      { route: "AdminDashboard", label: "Live Check-ins", icon: "radio-outline" },
      { route: "AdminSchedule", label: "Calendar / Schedule", icon: "calendar-outline" },
    ],
  },
  {
    title: "PEOPLE",
    items: [
      { route: "AdminPlayers", label: "Players", icon: "person-outline" },
      { route: "AdminCoaches", label: "Coaches", icon: "people-outline" },
      { route: "AdminRolesPermissions", label: "Roles & Permissions", icon: "shield-outline" },
    ],
  },
  {
    title: "BUSINESS",
    items: [
      { route: "AdminPayments", label: "Payments", icon: "card-outline" },
      { route: "AdminSubscriptions", label: "Subscriptions", icon: "repeat-outline" },
      { route: "AdminReports", label: "Reports", icon: "bar-chart-outline" },
      { route: "AdminFinance", label: "Finance Overview", icon: "trending-up-outline", ownerOnly: true },
    ],
  },
  {
    title: "SETTINGS",
    items: [
      { route: "AdminCourts", label: "Courts & Locations", icon: "tennisball-outline" },
      { route: "AdminClasses", label: "Classes & Programs", icon: "albums-outline" },
      { route: "AdminSettings", label: "Academy Settings", icon: "settings-outline" },
    ],
  },
];

type PortalMode = "admin" | "coach" | "owner";

interface Props {
  activeRoute: DesktopAdminRoute;
  onNavigate: (route: DesktopAdminRoute) => void;
  academyName?: string;
}

function NavItemRow({ item, isActive, onPress }: { item: NavItem; isActive: boolean; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      style={[styles.navItem, isActive && styles.navItemActive, !isActive && hovered && styles.navItemHovered]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Ionicons
        name={item.icon}
        size={18}
        color={isActive ? "#C8FF3D" : Colors.dark.textMuted}
        style={styles.navIcon}
      />
      <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
        {item.label}
      </Text>
      {isActive && <View style={styles.activeIndicator} />}
    </Pressable>
  );
}

export default function DesktopAdminSidebar({ activeRoute, onNavigate, academyName }: Props) {
  const { user } = useAuth();
  const isOwner = user?.role === "academy_owner";
  const [portalMode, setPortalMode] = useState<PortalMode>("admin");

  const initials = user?.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((w: string) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "A";

  return (
    <View style={styles.sidebar}>
      <View style={styles.logoSection}>
        <View style={styles.logoIcon}>
          <Ionicons name="flash" size={20} color="#C8FF3D" />
        </View>
        <View style={styles.logoText}>
          <Text style={styles.logoName} numberOfLines={1}>
            {academyName ?? "Academy"}
          </Text>
          <Text style={styles.logoRole}>Admin Portal</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
        {NAV_SECTIONS.map((section) => {
          if (section.ownerOnly && !isOwner) return null;
          const visibleItems = section.items.filter(
            (item) => !item.ownerOnly || isOwner
          );
          if (visibleItems.length === 0) return null;
          return (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionLabel}>{section.title}</Text>
              {visibleItems.map((item) => (
                <NavItemRow
                  key={`${item.route}-${item.label}`}
                  item={item}
                  isActive={activeRoute === item.route}
                  onPress={() => onNavigate(item.route)}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.divider} />

        <View style={styles.modeSwitcher}>
          <Text style={styles.modeLabel}>View as:</Text>
          <View style={styles.modePills}>
            {(["admin", "coach", "owner"] as PortalMode[]).map((mode) => (
              <Pressable
                key={mode}
                style={[styles.modePill, portalMode === mode && styles.modePillActive]}
                onPress={() => setPortalMode(mode)}
              >
                <Text style={[styles.modePillText, portalMode === mode && styles.modePillTextActive]}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.name ?? "Admin"}
            </Text>
            <Text style={styles.userRole} numberOfLines={1}>
              {user?.role === "academy_owner" ? "Owner" : "Admin"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 240;
const NEON = "#C8FF3D";
const SIDEBAR_BG = "#0B0D10";
const BORDER_COLOR = "rgba(255,255,255,0.07)";

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    backgroundColor: SIDEBAR_BG,
    borderRightWidth: 1,
    borderRightColor: BORDER_COLOR,
    flexDirection: "column",
  },
  logoSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(200,255,61,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    flex: 1,
  },
  logoName: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  logoRole: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER_COLOR,
    marginHorizontal: Spacing.md,
  },
  navScroll: {
    flex: 1,
    paddingTop: Spacing.sm,
  },
  section: {
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  sectionLabel: {
    color: Colors.dark.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 9,
    borderRadius: BorderRadius.sm,
    marginBottom: 2,
    position: "relative",
  },
  navItemActive: {
    backgroundColor: "rgba(200,255,61,0.08)",
  },
  navItemHovered: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  navIcon: {
    marginRight: Spacing.sm,
    width: 20,
    textAlign: "center",
  },
  navLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  navLabelActive: {
    color: NEON,
    fontWeight: "600",
  },
  activeIndicator: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: NEON,
    position: "absolute",
    right: 0,
  },
  footer: {
    paddingBottom: Spacing.md,
  },
  modeSwitcher: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  modeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  modePills: {
    flexDirection: "row",
    gap: 4,
  },
  modePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modePillActive: {
    backgroundColor: "rgba(200,255,61,0.1)",
    borderColor: "rgba(200,255,61,0.3)",
  },
  modePillText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  modePillTextActive: {
    color: NEON,
    fontWeight: "700",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,133,27,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,133,27,0.3)",
  },
  avatarText: {
    color: Colors.dark.orange,
    fontSize: 13,
    fontWeight: "700",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600",
  },
  userRole: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
});
