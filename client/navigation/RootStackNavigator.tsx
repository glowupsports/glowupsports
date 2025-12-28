import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CoachNavigator from "@/coach/navigation/CoachNavigator";
import PlayerNavigator from "@/player/navigation/PlayerNavigator";
import LoginScreen from "@/coach/screens/LoginScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors } from "@/constants/theme";

export type RootStackParamList = {
  Player: undefined;
  Coach: undefined;
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

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!isAuthenticated ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : mode === "coach" ? (
        <Stack.Screen
          name="Coach"
          component={CoachNavigator}
          options={{ headerShown: false }}
        />
      ) : (
        <Stack.Screen
          name="Player"
          component={PlayerNavigator}
          options={{ headerShown: false }}
        />
      )}
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
