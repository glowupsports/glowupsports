import React, { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors } from "@/constants/theme";
import { WEB_DESKTOP_BREAKPOINT } from "@/components/WebContainer";

const ACCENT = Colors.dark.primary;
const BG_SIDEBAR = "#0F141B";
const BG_MAIN = "#0C1118";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT = "#F0F4F8";
const MUTED = "#8A95A3";

// Exported so SwipeableTabBar can use the same value to compute containerWidth.
export const PLAYER_DESKTOP_SIDEBAR_WIDTH = 240;
// Maximum width for the main content column on very wide screens.
export const PLAYER_DESKTOP_CONTENT_MAX_WIDTH = 920;

interface NavItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
}

const NAV_ITEMS: NavItem[] = [
  { key: "Home",      label: "Home",   icon: "home-outline",            iconFocused: "home" },
  { key: "Community", label: "Social", icon: "people-outline",          iconFocused: "people" },
  { key: "PlayStack", label: "Play",   icon: "game-controller-outline", iconFocused: "game-controller" },
  { key: "Growth",    label: "Growth", icon: "trending-up-outline",     iconFocused: "trending-up" },
  { key: "Profile",   label: "Me",     icon: "person-outline",          iconFocused: "person" },
];

interface PlayerDesktopShellProps {
  children: React.ReactNode;
}

export function PlayerDesktopShell({ children }: PlayerDesktopShellProps) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= WEB_DESKTOP_BREAKPOINT;

  const [activeKey, setActiveKey] = useState("Home");
  const { navigateToTab, registerActiveTabListener } = useTabNavigation();
  const { player, user } = useAuth();

  const { data: dashData } = useQuery<{ academy?: { name?: string } }>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: isDesktop && !!user?.playerId,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    const unregister = registerActiveTabListener((_index: number, key: string) => {
      setActiveKey(key);
    });
    return unregister;
  }, [registerActiveTabListener]);

  const handleNavPress = useCallback(
    (item: NavItem) => {
      navigateToTab(item.key);
    },
    [navigateToTab],
  );

  if (!isDesktop) {
    return <>{children}</>;
  }

  // Player identity
  const displayName = player?.displayName || player?.name || "Player";
  const level = player?.level ?? 1;
  const photoUrl = player?.profilePhotoUrl ?? null;
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "P";

  // Academy branding — fall back to "Sports" when no academy linked
  const academyName = dashData?.academy?.name ?? "Sports";

  return (
    <View style={styles.root}>
      {/* ── Left sidebar ─────────────────────────────────────────────── */}
      <View style={styles.sidebar}>
        {/* Top: logo + branding */}
        <View style={styles.sidebarTop}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}>
              <Ionicons name="tennisball" size={18} color="#000000" />
            </View>
            <View>
              <Text style={styles.logoText}>Glow Up</Text>
              <Text style={styles.logoSub} numberOfLines={1}>{academyName}</Text>
            </View>
          </View>

          {/* Nav items */}
          <View style={styles.navSection}>
            <Text style={styles.navSectionLabel}>NAVIGATION</Text>
            {NAV_ITEMS.map((item) => {
              const focused = activeKey === item.key;
              return (
                <Pressable
                  key={item.key}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.navItem,
                    focused && styles.navItemActive,
                    !focused && pressed && styles.navItemHovered,
                  ]}
                  onPress={() => handleNavPress(item)}
                >
                  <Ionicons
                    name={focused ? item.iconFocused : item.icon}
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

        {/* Bottom: player identity */}
        <View style={styles.sidebarBottom}>
          <View style={styles.playerRow}>
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl }}
                style={styles.playerAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.playerAvatar, styles.playerAvatarFallback]}>
                <Text style={styles.playerInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.playerMeta}>
              <Text style={styles.playerName} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.playerBadgeRow}>
                <View style={styles.playerBadge}>
                  <Text style={styles.playerBadgeText}>PLAYER</Text>
                </View>
                <View style={styles.levelBadge}>
                  <Ionicons name="flash" size={9} color={ACCENT} />
                  <Text style={styles.levelBadgeText}>Lvl {level}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* ── Main content — centered, capped at 920px on ultra-wide ──── */}
      <View style={styles.mainArea}>
        <View style={styles.mainContent}>
          {children}
        </View>
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

  // ── Sidebar ──────────────────────────────────────────────────────────────
  sidebar: {
    width: PLAYER_DESKTOP_SIDEBAR_WIDTH,
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
    flexShrink: 0,
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

  // ── Nav items ────────────────────────────────────────────────────────────
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
  navActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACCENT,
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

  // ── Player identity ──────────────────────────────────────────────────────
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
  },
  playerAvatarFallback: {
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
  playerBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: ACCENT,
  },

  // ── Main content ─────────────────────────────────────────────────────────
  mainArea: {
    flex: 1,
    backgroundColor: BG_MAIN,
    overflow: "hidden",
    alignItems: "center",
  },
  mainContent: {
    flex: 1,
    width: "100%",
    maxWidth: PLAYER_DESKTOP_CONTENT_MAX_WIDTH,
  },
});
