import React from "react";
import { StyleSheet, View, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import OwnerDashboardScreen from "@/owner/screens/OwnerDashboardScreen";
import { Colors } from "@/constants/theme";

export type OwnerTabParamList = {
  OwnerDashboard: undefined;
  Academies: undefined;
  Billing: undefined;
  System: undefined;
};

export type OwnerStackParamList = {
  OwnerTabs: undefined;
};

const Tab = createBottomTabNavigator<OwnerTabParamList>();
const Stack = createNativeStackNavigator<OwnerStackParamList>();

function OwnerTabs() {
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
        tabBarActiveTintColor: Colors.dark.gold,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="OwnerDashboard"
        component={OwnerDashboardScreen}
        options={{
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Academies"
        component={OwnerDashboardScreen}
        options={{
          tabBarLabel: "Academies",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Billing"
        component={OwnerDashboardScreen}
        options={{
          tabBarLabel: "Billing",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="card-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="System"
        component={OwnerDashboardScreen}
        options={{
          tabBarLabel: "System",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cog-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function OwnerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OwnerTabs" component={OwnerTabs} />
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
