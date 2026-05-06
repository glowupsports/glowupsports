import React, { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { useAuth } from "@/coach/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/theme";

const ACCENT = "#C8FF3D";
const BG_SIDEBAR = "#0F141B";
const BG_MAIN = "#0C1118";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT = "#F0F4F8";
const MUTED = "#8A95A3";
const SIDEBAR_WIDTH = 240;

interface NavItem {
  key: string;
  label: string;
  icon: string;
  iconFocused: string;
  index: number;
}

const NAV_ITEMS: NavItem[] = [
  { key: "Home",      label: "Home",   icon: "home-outline",            iconFocused: "home",            index: 0 },
  { key: "Community", label: "Social", icon: "people-outline",          iconFocused: "people",          index: 1 },
  { key: "PlayStack", label: "Play",   icon: "game-controller-outline", iconFocused: "game-controller", index: 2 },
  { key: "Growth",    label: "Growth", icon: "trending-up-outline",     iconFocused: "trending-up",     index: 3 },
  { key: "Profile",   label: "Me",     icon: "person-outline",          iconFocused: "person",          index: 4 },
];

interface PlayerDesktopShellProps {
  children: React.ReactNode;
}

export function PlayerDesktopShell({ children }: PlayerDesktopShellProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { navigateToTab, registerActiveTabListener } = useTabNavigation();
  const { user } = useAuth();

  const { data: dashData } = useQuery<{ academy?: { name?: string } }>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
    staleTime: 10 * 60 * 1000,
  });

  const playerName = user?.displayName ?? null;
  const academyName = dashData?.academy?.name ?? null;

  useEffect(() => {
    const unregister = registerActiveTabListener((index: number) => {
      setActiveIndex(index);
    });
    return unregister;
  }, [registerActiveTabListener]);

  const handleNavPress = useCallback((item: NavItem) => {
    setActiveIndex(item.index);
    navigateToTab(item.key);
  }, [navigateToTab]);

  const initials = playerName
    ? playerName.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
    : "P";

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
              <Text style={styles.logoSub}>{academyName ?? "Sports"}</Text>
            </View>
          </View>

          <View style={styles.navSection}>
            <Text style={styles.navSectionLabel}>NAVIGATION</Text>
            {NAV_ITEMS.map((item) => {
              const focused = activeIndex === item.index;
              return (
                <Pressable
                  key={item.key}
                  style={({ pressed: hovered }: any) => [
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
          </View>
        </View>

        <View style={styles.sidebarBottom}>
          <View style={styles.playerRow}>
            <View style={styles.playerAvatar}>
              <Text style={styles.playerInitials}>{initials}</Text>
            </View>
            <View style={styles.playerMeta}>
              <Text style={styles.playerName} numberOfLines={1}>
                {playerName ?? "Player"}
              </Text>
              <View style={styles.playerBadge}>
                <Text style={styles.playerBadgeText}>PLAYER</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.mainArea}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontWeight: "700",
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
    fontWeight: "700",
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
    fontWeight: "500",
    color: MUTED,
    flex: 1,
  },
  navLabelActive: {
    color: ACCENT,
    fontWeight: "600",
  },
  navActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  sidebarBottom: {
    paddingHorizontal: 14,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(200,255,61,0.15)",
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitials: {
    fontSize: 14,
    fontWeight: "700",
    color: ACCENT,
  },
  playerMeta: {
    flex: 1,
    gap: 3,
  },
  playerName: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT,
  },
  playerBadge: {
    backgroundColor: "rgba(200,255,61,0.1)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: "flex-start",
  },
  playerBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: ACCENT,
    letterSpacing: 0.8,
  },
  mainArea: {
    flex: 1,
    backgroundColor: BG_MAIN,
    overflow: "hidden" as any,
  },
});
