import React, { useState, useCallback, useEffect } from "react";
import { Alert, View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { useAuth } from "@/coach/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const ACCENT = "#C8FF3D";
const BG_SIDEBAR = "#0F141B";
const BG_MAIN = "#0C1118";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT = "#F0F4F8";
const MUTED = "#8A95A3";
const BADGE_BG = "#EF4444";
const SIDEBAR_WIDTH = 240;

interface NavItem {
  key: string;
  label: string;
  icon: string;
  iconFocused: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "Dashboard", label: "Dashboard", icon: "home-outline", iconFocused: "home" },
  { key: "Calendar", label: "Calendar", icon: "calendar-outline", iconFocused: "calendar" },
  { key: "Players", label: "Players", icon: "people-outline", iconFocused: "people" },
  { key: "Coaching", label: "Coaching", icon: "clipboard-outline", iconFocused: "clipboard" },
  { key: "Settings", label: "Settings", icon: "settings-outline", iconFocused: "settings" },
];

interface DesktopShellProps {
  children: React.ReactNode;
  coachName?: string | null;
  academyName?: string | null;
}

export function DesktopShell({ children, coachName, academyName }: DesktopShellProps) {
  const [activeKey, setActiveKey] = useState("Dashboard");
  const { navigateToTab, registerActiveTabListener, getNavigation } = useTabNavigation();
  const { logout } = useAuth();
  const { coach } = useCoach();

  const coachId = coach?.id;

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/coaches", coachId, "unread-count"],
    enabled: !!coachId,
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.unreadCount ?? 0;

  const handleLogout = useCallback(() => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            logout();
          },
        },
      ]
    );
  }, [logout]);

  useEffect(() => {
    const unregister = registerActiveTabListener((_index: number, key: string) => {
      setActiveKey(key);
    });
    return unregister;
  }, [registerActiveTabListener]);

  const handleNavPress = useCallback((item: NavItem) => {
    setActiveKey(item.key);
    navigateToTab(item.key);
  }, [navigateToTab]);

  const handleChatPress = useCallback(() => {
    const nav = getNavigation();
    if (nav) {
      nav.navigate("ChatInbox" as never);
    }
  }, [getNavigation]);

  const initials = coachName
    ? coachName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "C";

  return (
    <View style={styles.root}>
      <View style={styles.sidebar}>
        <View style={styles.sidebarTop}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}>
              <Ionicons name="tennisball" size={18} color={Colors.dark.buttonText} />
            </View>
            <View>
              <Text style={styles.logoText}>Glow Up</Text>
              <Text style={styles.logoSub}>{academyName || "Tennis Academy"}</Text>
            </View>
          </View>

          {coachName ? (
            <View style={styles.coachSubheader}>
              <View style={styles.coachSubheaderAvatar}>
                <Text style={styles.coachSubheaderInitials}>
                  {coachName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                </Text>
              </View>
              <View style={styles.coachSubheaderMeta}>
                <Text style={styles.coachSubheaderName} numberOfLines={1}>{coachName}</Text>
                {academyName ? (
                  <Text style={styles.coachSubheaderAcademy} numberOfLines={1}>{academyName}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.navSection}>
            <Text style={styles.navSectionLabel}>NAVIGATION</Text>
            {NAV_ITEMS.map((item) => {
              const focused = activeKey === item.key;
              return (
                <Pressable
                  key={item.key}
                  style={({ pressed: hovered } : any) => [
                    styles.navItem,
                    focused && styles.navItemActive,
                    !focused && hovered && styles.navItemHovered,
                  ]}
                  onPress={() => handleNavPress(item)}
                >
                  <Ionicons
                    name={(focused ? item.iconFocused : item.icon) as any}
                    size={19}
                    color={focused ? ACCENT : MUTED}
                  />
                  <Text style={[styles.navLabel, focused && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                  {focused ? <View style={styles.navActiveDot} /> : null}
                </Pressable>
              );
            })}

            <Pressable
              style={({ pressed: hovered } : any) => [
                styles.navItem,
                hovered && styles.navItemHovered,
              ]}
              onPress={handleChatPress}
            >
              <View style={styles.chatIconWrapper}>
                <Ionicons
                  name="chatbubble-outline"
                  size={19}
                  color={MUTED}
                />
                {unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 99 ? "99+" : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.navLabel}>Chat</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sidebarBottom}>
          <View style={styles.coachRow}>
            <View style={styles.coachAvatar}>
              <Text style={styles.coachInitials}>{initials}</Text>
            </View>
            <View style={styles.coachMeta}>
              <Text style={styles.coachName} numberOfLines={1}>
                {coachName || "Coach"}
              </Text>
              <View style={styles.coachBadge}>
                <Text style={styles.coachBadgeText}>COACH</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed: hovered } : any) => [
                styles.logoutBtn,
                hovered && styles.logoutBtnHovered,
              ]}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Ionicons name="log-out-outline" size={18} color={MUTED} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.mainArea}>
        {children}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: BG_MAIN,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: BG_SIDEBAR,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    flexDirection: "column",
    justifyContent: "space-between",
    paddingVertical: 24,
  },
  sidebarTop: {
    flex: 1,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    marginBottom: 32,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: TEXT,
    lineHeight: 18,
  },
  logoSub: {
    fontSize: 11,
    color: MUTED,
    lineHeight: 14,
  },
  navSection: {
    paddingHorizontal: 12,
  },
  navSectionLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "rgba(138,149,163,0.6)",
    letterSpacing: 1,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 2,
    position: "relative",
  },
  navItemActive: {
    backgroundColor: "rgba(200,255,61,0.08)",
  },
  navItemHovered: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  navLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: MUTED,
    flex: 1,
  },
  navLabelActive: {
    color: ACCENT,
    fontWeight: "600" as const,
  },
  navActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  chatIconWrapper: {
    position: "relative",
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadge: {
    position: "absolute",
    top: -5,
    right: -6,
    backgroundColor: BADGE_BG,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  unreadBadgeText: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: "#fff",
    lineHeight: 11,
  },
  sidebarBottom: {
    paddingHorizontal: 14,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  coachAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(200,255,61,0.15)",
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  coachInitials: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: ACCENT,
  },
  coachMeta: {
    flex: 1,
    gap: 3,
  },
  coachName: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: TEXT,
  },
  coachBadge: {
    backgroundColor: "rgba(200,255,61,0.1)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: "flex-start",
  },
  coachBadgeText: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: ACCENT,
    letterSpacing: 0.8,
  },
  logoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtnHovered: {
    backgroundColor: "rgba(239,68,68,0.12)",
  },
  coachSubheader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 20,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "rgba(200,255,61,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.12)",
  },
  coachSubheaderAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(200,255,61,0.15)",
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.3)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  coachSubheaderInitials: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: ACCENT,
  },
  coachSubheaderMeta: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  coachSubheaderName: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: TEXT,
  },
  coachSubheaderAcademy: {
    fontSize: 11,
    color: MUTED,
  },
  mainArea: {
    flex: 1,
    backgroundColor: BG_MAIN,
    overflow: "hidden" as any,
  },
}));
