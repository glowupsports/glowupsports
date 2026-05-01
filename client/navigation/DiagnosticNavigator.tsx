import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProPlayerHomeDiagnosticScreen from "@/player/screens/ProPlayerHomeDiagnosticScreen";
import { PlayerProvider as PlayerDataProvider } from "@/player/context/PlayerContext";

export type DiagnosticStackParamList = {
  DiagnosticHome: undefined;
};

const Stack = createNativeStackNavigator<DiagnosticStackParamList>();

export default function DiagnosticNavigator() {
  return (
    <PlayerDataProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="DiagnosticHome" component={ProPlayerHomeDiagnosticScreen} />
      </Stack.Navigator>
    </PlayerDataProvider>
  );
}
