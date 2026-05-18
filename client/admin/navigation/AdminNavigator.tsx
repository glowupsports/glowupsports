import React, { useState, useCallback, useEffect } from "react";
import { StyleSheet, View, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AdminDashboardScreen from "@/admin/screens/AdminDashboardScreen";
import AdminCoachesScreen from "@/admin/screens/AdminCoachesScreen";
import AdminPlayersScreen from "@/admin/screens/AdminPlayersScreen";
import AdminCalendarScreen from "@/admin/screens/AdminCalendarScreen";
import AdminClassesScreen from "@/admin/screens/AdminClassesScreen";
import AdminReportsScreen from "@/admin/screens/AdminReportsScreen";
import AdminSettingsScreen from "@/admin/screens/AdminSettingsScreen";
import AdminPaymentsScreen from "@/admin/screens/AdminPaymentsScreen";
import AdminCourtsScreen from "@/admin/screens/AdminCourtsScreen";
import AdminLocationsScreen from "@/admin/screens/AdminLocationsScreen";
import AdminSubscriptionsScreen from "@/admin/screens/AdminSubscriptionsScreen";
import AdminRolesPermissionsScreen from "@/admin/screens/AdminRolesPermissionsScreen";
import AdminEquipmentScreen from "@/admin/screens/AdminEquipmentScreen";
import AdminCorporateAccountsScreen from "@/admin/screens/AdminCorporateAccountsScreen";
import AdminTransferSessionsScreen from "@/admin/screens/AdminTransferSessionsScreen";
import AdminConversationsScreen from "@/admin/screens/AdminConversationsScreen";
import AdminConversationDetailScreen from "@/admin/screens/AdminConversationDetailScreen";
import AdminBookingRequestsScreen from "@/admin/screens/AdminBookingRequestsScreen";
import AdminCourtBookingGridScreen from "@/admin/screens/AdminCourtBookingGridScreen";
import AdminBroadcastScreen from "@/admin/screens/AdminBroadcastScreen";
import { BroadcastComposeSheet } from "@/admin/components/BroadcastComposeSheet";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import { TabNavigationProvider, useTabNavigation } from "@/components/TabNavigationContext";
import { Colors } from "@/constants/theme";
import { useDesktop } from "@/hooks/useDesktop";
import { type DesktopAdminRoute } from "@/admin/components/desktop/DesktopAdminSidebar";
import DesktopAdminLayout from "@/admin/components/desktop/DesktopAdminLayout";import { useQuery } from "@tanstack/react-query";

export type AdminTabParamList = {
  AdminDashboard: undefined;
  AdminCoaches: undefined;
  AdminPlayers: undefined;
  AdminClasses: undefined;
  AdminSchedule: undefined;
  AdminReports: undefined;
  AdminSettings: undefined;
};

export type AdminStackParamList = {
  AdminTabs: undefined;
  AddCoach: undefined;
  AddPlayer: undefined;
  CoachDetail: { coachId: string };
  PlayerDetail: { playerId: string };
  AdminPayments: undefined;
  AdminCourts: undefined;
  AdminLocations: undefined;
  AdminSubscriptions: undefined;
  AdminRolesPermissions: undefined;
  AdminCoaches: undefined;
  AdminPlayers: undefined;
  AdminClasses: undefined;
  AdminReports: undefined;
  AdminEquipment: undefined;
  AdminCorporateAccounts: undefined;
  AdminTransferSessions: { fromCoachId?: string } | undefined;
  AdminConversations: undefined;
  AdminConversationDetail: { conversationId: string; coachName: string | null; playerName: string | null };
  AdminBookingRequests: undefined;
  AdminCourtBookingGrid: undefined;
  AdminBroadcast: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

const ADMIN_TABS: TabConfig[] = [
  { key: "AdminDashboard", label: "Dashboard", icon: "grid-outline", iconFocused: "grid", component: AdminDashboardScreen },
  { key: "AdminCoaches", label: "Coaches", icon: "people-outline", iconFocused: "people", component: AdminCoachesScreen },
  { key: "AdminPlayers", label: "Players", icon: "person-outline", iconFocused: "person", component: AdminPlayersScreen },
  { key: "AdminClasses", label: "Classes", icon: "albums-outline", iconFocused: "albums", component: AdminClassesScreen },
  { key: "AdminSchedule", label: "Schedule", icon: "calendar-outline", iconFocused: "calendar", component: AdminCalendarScreen },
  { key: "AdminReports", label: "Reports", icon: "bar-chart-outline", iconFocused: "bar-chart", component: AdminReportsScreen },
  { key: "AdminSettings", label: "Settings", icon: "settings-outline", iconFocused: "settings", component: AdminSettingsScreen },
];

const ROUTE_TO_TAB: Record<DesktopAdminRoute, string | null> = {
  AdminDashboard: "AdminDashboard",
  AdminSchedule: "AdminSchedule",
  AdminPlayers: "AdminPlayers",
  AdminCoaches: "AdminCoaches",
  AdminRolesPermissions: null,
  AdminPayments: null,
  AdminSubscriptions: null,
  AdminFinance: null,
  AdminReports: "AdminReports",
  AdminCourts: null,
  AdminCourtBookingGrid: null,
  AdminBroadcast: null,
  AdminClasses: "AdminClasses",
  AdminSettings: "AdminSettings",
  AdminConversations: null,
};

type SpecialRoute = "AdminRolesPermissions" | "AdminPayments" | "AdminSubscriptions" | "AdminCourts" | "AdminFinance" | "AdminConversations" | "AdminCourtBookingGrid" | "AdminBroadcast";

function isSpecialRoute(route: DesktopAdminRoute): route is SpecialRoute {
  return route === "AdminRolesPermissions" || route === "AdminPayments" || route === "AdminSubscriptions" || route === "AdminCourts" || route === "AdminFinance" || route === "AdminConversations" || route === "AdminCourtBookingGrid" || route === "AdminBroadcast";
}

const TAB_KEY_TO_ROUTE: Partial<Record<string, DesktopAdminRoute>> = {
  AdminDashboard: "AdminDashboard",
  AdminSchedule: "AdminSchedule",
  AdminPlayers: "AdminPlayers",
  AdminCoaches: "AdminCoaches",
  AdminReports: "AdminReports",
  AdminClasses: "AdminClasses",
  AdminSettings: "AdminSettings",
};

function DesktopAdminContent() {
  const [activeRoute, setActiveRoute] = useState<DesktopAdminRoute>("AdminDashboard");
  const [specialContent, setSpecialContent] = useState<React.ReactNode>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const { navigateToTab, registerActiveTabListener } = useTabNavigation();

  const { data: academyData } = useQuery<{ name?: string }>({
    queryKey: ["/api/academy/info"],
  });

  useEffect(() => {
    const unsubscribe = registerActiveTabListener((_index, key) => {
      const route = TAB_KEY_TO_ROUTE[key];
      if (route) {
        setActiveRoute(route);
        setSpecialContent(null);
      }
    });
    return unsubscribe;
  }, [registerActiveTabListener]);

  const handleNavigate = useCallback(
    (route: DesktopAdminRoute) => {
      setActiveRoute(route);
      if (route === "AdminBroadcast") {
        setShowBroadcast(true);
        return;
      }
      if (isSpecialRoute(route)) {
        switch (route) {
          case "AdminRolesPermissions":
            setSpecialContent(<AdminRolesPermissionsScreen />);
            break;
          case "AdminPayments":
            setSpecialContent(<AdminPaymentsScreen />);
            break;
          case "AdminSubscriptions":
            setSpecialContent(<AdminSubscriptionsScreen />);
            break;
          case "AdminCourts":
            setSpecialContent(<AdminCourtsScreen />);
            break;
          case "AdminFinance":
            setSpecialContent(<AdminPaymentsScreen />);
            break;
          case "AdminConversations":
            setSpecialContent(<AdminConversationsScreen />);
            break;
          case "AdminCourtBookingGrid":
            setSpecialContent(<AdminCourtBookingGridScreen />);
            break;
          default:
            break;
        }
      } else {
        setSpecialContent(null);
        const tabKey = ROUTE_TO_TAB[route];
        if (tabKey) {
          navigateToTab(tabKey);
        }
      }
    },
    [navigateToTab]
  );

  return (
    <DesktopAdminLayout
      activeRoute={activeRoute}
      onNavigate={handleNavigate}
      academyName={academyData?.name}
    >
      {specialContent ? (
        <View style={styles.desktopFullPage}>{specialContent}</View>
      ) : null}
      <View style={specialContent ? styles.desktopHidden : styles.desktopFullPage}>
        <SwipeableTabBar
          tabs={ADMIN_TABS}
          primaryColor={Colors.dark.orange}
          secondaryColor={Colors.dark.gold}
          hideTabBar
        />
      </View>
      <BroadcastComposeSheet
        visible={showBroadcast}
        onClose={() => {
          setShowBroadcast(false);
          setActiveRoute("AdminDashboard");
        }}
      />
    </DesktopAdminLayout>
  );
}

function AdminTabs() {
  const isDesktop = useDesktop();

  if (isDesktop) {
    return <DesktopAdminContent />;
  }

  return (
    <SwipeableTabBar
      tabs={ADMIN_TABS}
      primaryColor={Colors.dark.orange}
      secondaryColor={Colors.dark.gold}
    />
  );
}

function AdminStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Task #1417 — Mirror the player stacks: don't freeze inactive
        // screens on iOS Fabric to avoid the cold-start commit-stall.
        // See RootStackNavigator for the full rationale. Android keeps
        // the default freeze behaviour to save CPU.
        freezeOnBlur: Platform.OS !== "ios",
      }}
    >
      <Stack.Screen name="AdminTabs" component={AdminTabs} />
      <Stack.Screen name="AdminPayments" component={AdminPaymentsScreen} />
      <Stack.Screen name="AdminCourts" component={AdminCourtsScreen} />
      <Stack.Screen name="AdminLocations" component={AdminLocationsScreen} />
      <Stack.Screen name="AdminSubscriptions" component={AdminSubscriptionsScreen} />
      <Stack.Screen name="AdminRolesPermissions" component={AdminRolesPermissionsScreen} />
      <Stack.Screen name="AdminEquipment" component={AdminEquipmentScreen} />
      <Stack.Screen name="AdminCorporateAccounts" component={AdminCorporateAccountsScreen} />
      <Stack.Screen name="AdminTransferSessions" component={AdminTransferSessionsScreen} />
      <Stack.Screen name="AdminConversations" component={AdminConversationsScreen} />
      <Stack.Screen name="AdminConversationDetail" component={AdminConversationDetailScreen} />
      <Stack.Screen name="AdminBookingRequests" component={AdminBookingRequestsScreen} />
      <Stack.Screen name="AdminCourtBookingGrid" component={AdminCourtBookingGridScreen} />
      <Stack.Screen name="AdminBroadcast" component={AdminBroadcastScreen} />
    </Stack.Navigator>
  );
}

export default function AdminNavigator() {
  return (
    <TabNavigationProvider>
      <View style={styles.container}>
        <AdminStackNavigator />
      </View>
    </TabNavigationProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  desktopFullPage: {
    flex: 1,
    overflow: "hidden",
  },
  desktopHidden: {
    flex: 0,
    width: 0,
    height: 0,
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none" as const,
  },
});
