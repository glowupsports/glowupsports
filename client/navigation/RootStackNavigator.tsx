import React, { useState, useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, View, StyleSheet, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CommonActions, useNavigationContainerRef } from "@react-navigation/native";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CoachNavigator from "@/coach/navigation/CoachNavigator";
import PlayerNavigator from "@/player/navigation/PlayerNavigator";
import AdminNavigator from "@/admin/navigation/AdminNavigator";
import OwnerNavigator from "@/owner/navigation/OwnerNavigator";
import PlatformNavigator from "@/platform/navigation/PlatformNavigator";
import ProviderNavigator from "@/provider/navigation/ProviderNavigator";
import ProviderJoinScreen from "@/provider/screens/ProviderJoinScreen";
import LoginScreen from "@/coach/screens/LoginScreen";
import ResetPasswordScreen from "@/screens/ResetPasswordScreen";
import BootScreen from "@/screens/BootScreen";
import { ClaimInviteScreen } from "@/screens/ClaimInviteScreen";
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
  Provider: undefined;
  Login: undefined;
  ResetPassword: { token?: string } | undefined;
  ProviderJoin: { token: string };
  ClaimInvite: { token: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const PENDING_GROUP_KEY = "pending_group_deep_link";
const PENDING_INVITE_TOKEN_KEY = "pending_invite_token";

function extractGroupIdFromUrl(url: string): string | null {
  const match = url.match(/\/group\/([a-zA-Z0-9\-_]+)/);
  return match ? match[1] : null;
}

function extractInviteTokenFromUrl(url: string): string | null {
  try {
    if (!url.includes("invite")) return null;
    const tokenMatch = url.match(/[?&]token=([a-zA-Z0-9\-_]+)/);
    if (tokenMatch) return tokenMatch[1];
    const parsed = Linking.parse(url);
    if (parsed.queryParams?.token) {
      return String(parsed.queryParams.token);
    }
    return null;
  } catch {
    return null;
  }
}

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

    const PUBLIC_ROUTES: (keyof RootStackParamList)[] = ["ProviderJoin", "Login", "ResetPassword"];
    const navState = navigationRef.getState?.();
    const currentRoute = navState?.routes?.[navState.index]?.name as keyof RootStackParamList | undefined;
    if (!isAuthenticated && currentRoute && PUBLIC_ROUTES.includes(currentRoute) && currentRoute !== "Login") {
      return;
    }

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
        case "service_provider": targetRoute = "Provider"; break;
        case "player":
        default: targetRoute = "Player"; break;
      }
    }

    try {
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

function usePendingGroupDeepLink(
  isAuthenticated: boolean,
  bootComplete: boolean,
  mode: string,
  navigationRef: ReturnType<typeof useNavigationContainerRef> | null
) {
  const handledRef = useRef(false);

  useEffect(() => {
    async function capturePendingLink() {
      try {
        const url = await Linking.getInitialURL();
        if (!url) return;
        const groupId = extractGroupIdFromUrl(url);
        if (groupId) {
          await AsyncStorage.setItem(PENDING_GROUP_KEY, groupId);
        }
        const inviteToken = extractInviteTokenFromUrl(url);
        if (inviteToken) {
          await AsyncStorage.setItem(PENDING_INVITE_TOKEN_KEY, inviteToken);
        }
      } catch {}
    }
    capturePendingLink();
    const sub = Linking.addEventListener("url", ({ url }) => {
      const inviteToken = extractInviteTokenFromUrl(url);
      if (inviteToken) {
        AsyncStorage.setItem(PENDING_INVITE_TOKEN_KEY, inviteToken).catch(() => {});
        if (navigationRef?.isReady()) {
          navigationRef.dispatch(
            CommonActions.navigate("ClaimInvite", { token: inviteToken })
          );
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isAuthenticated || !navigationRef?.isReady()) return;
    async function handlePendingInvite() {
      try {
        const token = await AsyncStorage.getItem(PENDING_INVITE_TOKEN_KEY);
        if (!token) return;
        navigationRef!.dispatch(CommonActions.navigate("ClaimInvite", { token }));
      } catch {}
    }
    handlePendingInvite();
  }, [isAuthenticated, navigationRef]);

  useEffect(() => {
    const isPlayerMode = !mode || mode === "player";
    if (!isAuthenticated || !bootComplete || !isPlayerMode || !navigationRef?.isReady() || handledRef.current) return;

    async function navigatePending() {
      try {
        const groupId = await AsyncStorage.getItem(PENDING_GROUP_KEY);
        if (!groupId) return;
        await AsyncStorage.removeItem(PENDING_GROUP_KEY);
        handledRef.current = true;
        navigationRef!.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [
              {
                name: "Player",
                state: {
                  index: 1,
                  routes: [
                    { name: "Home" },
                    { name: "GroupDetail", params: { groupId, groupName: "" } },
                  ],
                },
              },
            ],
          })
        );
      } catch {}
    }
    navigatePending();
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
  usePendingGroupDeepLink(isAuthenticated, bootComplete, mode, navigationRef ?? null);

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
      case "service_provider": return "Provider";
      case "player":
      default: return "Player";
    }
  };

  return (
    <Stack.Navigator 
      screenOptions={{
        ...screenOptions,
        // Task #1407 — iOS cold-start: keep inactive screens unfrozen.
        // react-native-screens defaults freeze inactive screens on iOS Fabric,
        // which contributes to the player tabs sitting on a spinner until a
        // gesture or AppState event flushes the pending React commit. Disable
        // on iOS only; Android keeps the default freeze behavior to save CPU.
        // (Note: `detachInactiveScreens` is NOT a native-stack screen option
        // and is silently ignored if added here. The companion fix that
        // actually flushes the pending iOS commit lives in App.tsx — search
        // for `iosPaintTick`.)
        freezeOnBlur: Platform.OS !== "ios",
      }}
      initialRouteName={getInitialRoute()}
    >
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
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
      <Stack.Screen
        name="Provider"
        component={ProviderNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProviderJoin"
        component={ProviderJoinScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ClaimInvite"
        options={{ headerShown: false, presentation: "modal" }}
      >
        {({ route, navigation }) => (
          <ClaimInviteScreen
            inviteToken={(route.params as { token: string }).token}
            onBack={async () => {
              try {
                await AsyncStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
              } catch {}
              navigation.goBack();
            }}
          />
        )}
      </Stack.Screen>
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
