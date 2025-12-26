import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import DrawerNavigator from "@/navigation/DrawerNavigator";
import CoachNavigator from "@/coach/navigation/CoachNavigator";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAppMode } from "@/context/AppModeContext";

export type RootStackParamList = {
  Main: undefined;
  Coach: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { mode } = useAppMode();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {mode === "coach" ? (
        <Stack.Screen
          name="Coach"
          component={CoachNavigator}
          options={{ headerShown: false }}
        />
      ) : (
        <Stack.Screen
          name="Main"
          component={DrawerNavigator}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
