import React from "react";
import { StyleSheet, View, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import AdminDashboardScreen from "@/admin/screens/AdminDashboardScreen";
import { Colors } from "@/constants/theme";

export type AdminTabParamList = {
  AdminDashboard: undefined;
  Users: undefined;
  Reports: undefined;
  Settings: undefined;
};

export type AdminStackParamList = {
  AdminTabs: undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();
const Stack = createNativeStackNavigator<AdminStackParamList>();

function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <View style={styles.tabBarBackground}>
            {Platform.OS === "ios" ? (
              <BlurView
                intensity={80}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.androidTabBackground]} />
            )}
          </View>
        ),
        tabBarActiveTintColor: Colors.dark.orange,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Users"
        component={AdminDashboardScreen}
        options={{
          tabBarLabel: "Users",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Reports"
        component={AdminDashboardScreen}
        options={{
          tabBarLabel: "Reports",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={AdminDashboardScreen}
        options={{
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminTabs" component={AdminTabs} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: "transparent",
    height: 85,
    paddingTop: 8,
  },
  tabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  androidTabBackground: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
});
