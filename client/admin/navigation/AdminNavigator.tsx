import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
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
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import { TabNavigationProvider } from "@/components/TabNavigationContext";
import { Colors } from "@/constants/theme";

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

function AdminTabs() {
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminTabs" component={AdminTabs} />
      <Stack.Screen name="AdminPayments" component={AdminPaymentsScreen} />
      <Stack.Screen name="AdminCourts" component={AdminCourtsScreen} />
      <Stack.Screen name="AdminLocations" component={AdminLocationsScreen} />
      <Stack.Screen name="AdminSubscriptions" component={AdminSubscriptionsScreen} />
      <Stack.Screen name="AdminRolesPermissions" component={AdminRolesPermissionsScreen} />
      <Stack.Screen name="AdminEquipment" component={AdminEquipmentScreen} />
      <Stack.Screen name="AdminCorporateAccounts" component={AdminCorporateAccountsScreen} />
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
});
