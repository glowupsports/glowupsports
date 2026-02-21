import React, { useState, useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CommonActions, useNavigationContainerRef } from "@react-navigation/native";
import CoachNavigator from "@/coach/navigation/CoachNavigator";
import PlayerNavigator from "@/player/navigation/PlayerNavigator";
import AdminNavigator from "@/admin/navigation/AdminNavigator";
import OwnerNavigator from "@/owner/navigation/OwnerNavigator";
import PlatformNavigator from "@/platform/navigation/PlatformNavigator";
import LoginScreen from "@/coach/screens/LoginScreen";
import BootScreen from "@/screens/BootScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Colors } from "@/constants/theme";

export type RootStackParamList = {
  Boot: undefined;
  Player: undefined;
  Coach: undefined;
  Admin: undefined;
  AcademyOwner: undefined;
  Platform: undefined;
  Login: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function BootScreenWrapper({ onBootComplete }: { onBootComplete: () => void }) {
  return <BootScreen onBootComplete={onBootComplete} />;
}

function useNavigationEffect(
  isAuthenticated: boolean,
  bootComplete: boolean,
  mode: string,
  navigationRef: ReturnType<typeof useNavigationContainerRef> | null
) {
  const prevAuthRef = useRef(isAuthenticated);
  const prevBootRef = useRef(bootComplete);
  const prevModeRef = useRef(mode);

  useEffect(() => {
    if (!navigationRef?.isReady()) return;

    const authChanged = prevAuthRef.current !== isAuthenticated;
    const bootChanged = prevBootRef.current !== bootComplete;
    const modeChanged = prevModeRef.current !== mode;
    
    prevAuthRef.current = isAuthenticated;
    prevBootRef.current = bootComplete;
    prevModeRef.current = mode;

    let targetRoute: keyof RootStackParamList;
    if (!isAuthenticated) {
      targetRoute = "Login";
    } else if (!bootComplete) {
      targetRoute = "Boot";
    } else {
      switch (mode) {
        case "platform": targetRoute = "Platform"; break;
        case "academy_owner": targetRoute = "AcademyOwner"; break;
        case "admin": targetRoute = "Admin"; break;
        case "coach": targetRoute = "Coach"; break;
        case "player":
        default: targetRoute = "Player"; break;
      }
    }

    try {
      const navState = navigationRef.getState?.();
      const currentRoute = navState?.routes?.[navState.index]?.name;
      const needsNavigation = authChanged || bootChanged || modeChanged || currentRoute !== targetRoute;

      if (!needsNavigation) return;

      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: targetRoute }],
        })
      );
    } catch {
    }
  }, [isAuthenticated, bootComplete, mode, navigationRef]);
}

export default function RootStackNavigator({ navigationRef }: { navigationRef?: ReturnType<typeof useNavigationContainerRef> | null }) {
  const screenOptions = useScreenOptions();
  const { mode } = useAppMode();
  const { isAuthenticated, isLoading } = useAuth();
  const [bootComplete, setBootComplete] = useState(false);

  const handleBootComplete = useCallback(() => {
    setBootComplete(true);
  }, []);

  usePushNotifications();
  useNavigationEffect(isAuthenticated, bootComplete, mode, navigationRef ?? null);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  const getInitialRoute = (): keyof RootStackParamList => {
    if (!isAuthenticated) return "Login";
    if (!bootComplete) return "Boot";
    switch (mode) {
      case "platform": return "Platform";
      case "academy_owner": return "AcademyOwner";
      case "admin": return "Admin";
      case "coach": return "Coach";
      case "player":
      default: return "Player";
    }
  };

  return (
    <Stack.Navigator 
      screenOptions={screenOptions}
      initialRouteName={getInitialRoute()}
    >
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Boot"
        options={{ headerShown: false }}
      >
        {() => <BootScreenWrapper onBootComplete={handleBootComplete} />}
      </Stack.Screen>
      <Stack.Screen
        name="Platform"
        component={PlatformNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AcademyOwner"
        component={OwnerNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Admin"
        component={AdminNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Coach"
        component={CoachNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Player"
        component={PlayerNavigator}
        options={{ headerShown: false }}
      />
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
