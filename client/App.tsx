import React from "react";
import { StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PlayerProvider } from "@/context/PlayerContext";
import { AppModeProvider } from "@/context/AppModeContext";
import { CoachProvider } from "@/coach/context/CoachContext";
import { AuthProvider } from "@/coach/context/AuthContext";

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.root}>
            <KeyboardProvider>
              <AppModeProvider>
                <AuthProvider>
                  <PlayerProvider>
                    <CoachProvider>
                      <View style={styles.root}>
                        <NavigationContainer>
                          <RootStackNavigator />
                        </NavigationContainer>
                      </View>
                    </CoachProvider>
                  </PlayerProvider>
                </AuthProvider>
              </AppModeProvider>
              <StatusBar style="light" />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
