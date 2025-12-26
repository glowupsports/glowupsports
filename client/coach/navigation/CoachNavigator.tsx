import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CalendarScreen from "@/coach/screens/CalendarScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type CoachStackParamList = {
  Calendar: undefined;
};

const Stack = createNativeStackNavigator<CoachStackParamList>();

export default function CoachNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
