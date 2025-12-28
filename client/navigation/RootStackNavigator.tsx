import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CoachNavigator from "@/coach/navigation/CoachNavigator";
import PlayerNavigator from "@/player/navigation/PlayerNavigator";
import AdminNavigator from "@/admin/navigation/AdminNavigator";
import OwnerNavigator from "@/owner/navigation/OwnerNavigator";
import LoginScreen from "@/coach/screens/LoginScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors } from "@/constants/theme";

export type RootStackParamList = {
  Player: undefined;
  Coach: undefined;
  Admin: undefined;
  Owner: undefined;
  Login: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { mode } = useAppMode();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  const getNavigator = () => {
    if (!isAuthenticated) {
      return (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      );
    }

    switch (mode) {
      case "owner":
        return (
          <Stack.Screen
            name="Owner"
            component={OwnerNavigator}
            options={{ headerShown: false }}
          />
        );
      case "admin":
        return (
          <Stack.Screen
            name="Admin"
            component={AdminNavigator}
            options={{ headerShown: false }}
          />
        );
      case "coach":
        return (
          <Stack.Screen
            name="Coach"
            component={CoachNavigator}
            options={{ headerShown: false }}
          />
        );
      case "player":
      default:
        return (
          <Stack.Screen
            name="Player"
            component={PlayerNavigator}
            options={{ headerShown: false }}
          />
        );
    }
  };

  return (
    <Stack.Navigator key={isAuthenticated ? mode : "login"} screenOptions={screenOptions}>
      {getNavigator()}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
