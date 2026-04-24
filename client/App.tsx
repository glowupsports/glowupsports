import logger from "@/lib/logger";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { StyleSheet, View, Platform, Alert } from "react-native";
import { useFonts } from "expo-font";
import {
  Ionicons,
  Feather,
  MaterialIcons,
  AntDesign,
  FontAwesome,
  Entypo,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import { NavigationContainer, NavigationContainerRef, LinkingOptions, useNavigationContainerRef, getStateFromPath as defaultGetStateFromPath } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n, { initializeI18n, isRTL } from "@/i18n";
import { initializeRevenueCat, SubscriptionProvider } from "@/lib/revenuecat";

try {
  initializeRevenueCat();
} catch (err: unknown) {
  if (__DEV__) console.warn("[RevenueCat] Init skipped:", err instanceof Error ? err.message : String(err));
}

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || "";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: true,
    tracesSampleRate: 0.2,
    environment: __DEV__ ? "development" : "production",
    beforeSend(event) {
      if (__DEV__) return null;
      return event;
    },
  });
}

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { getEnv } from "@/lib/env";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { AutoLockOverlay } from "@/components/AutoLockOverlay";
import { setActiveRouteName, getDeepestRouteName } from "@/lib/activeRoute";
import { useAuth } from "@/coach/context/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateController } from "@/components/UpdateController";
import { AnimatedSplashScreen } from "@/components/AnimatedSplashScreen";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { WhatsNewGate } from "@/components/WhatsNewModal";

import { PlayerProvider } from "@/context/PlayerContext";
import { AppModeProvider } from "@/context/AppModeContext";
import { NetworkProvider } from "@/context/NetworkContext";
import { CoachProvider } from "@/coach/context/CoachContext";
import { AuthProvider } from "@/coach/context/AuthContext";
import { UIInteractionProvider } from "@/contexts/UIInteractionContext";
import { TabNavigationProvider, useTabNavigation } from "@/components/TabNavigationContext";
import { CoachMarksProvider } from "@/components/CoachMarks";
import { CelebrationProvider } from "@/contexts/CelebrationContext";
import { AcademyThemeProvider } from "@/contexts/AcademyThemeContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { WebContainer } from "@/components/WebContainer";
import { WebAlertProvider } from "@/components/WebAlertProvider";

// react-native-keyboard-controller uses NativeEventEmitter which is unavailable
// on web. Load KeyboardProvider only on native (iOS/Android) to prevent crashes.
const NativeKeyboardProvider: React.ComponentType<{ children: React.ReactNode }> | null =
  Platform.OS !== "web"
    ? require("react-native-keyboard-controller").KeyboardProvider
    : null;

function KeyboardWrapper({ children }: { children: React.ReactNode }) {
  if (!NativeKeyboardProvider) return <>{children}</>;
  return React.createElement(NativeKeyboardProvider, null, children);
}

// Use getEnv() so we get the production-fallback domain when EXPO_PUBLIC_DOMAIN
// is missing in a built app (otherwise deep-link prefixes silently drop).
const DOMAIN = getEnv().EXPO_PUBLIC_DOMAIN || undefined;

const GROUP_PATH_RE = /^group\/([a-zA-Z0-9\-_]+)$/;

const linking: LinkingOptions<any> = {
  prefixes: [
    Linking.createURL("/"),
    "glowupsports://",
    ...(DOMAIN ? [`https://${DOMAIN}`, `http://${DOMAIN}`] : []),
  ],
  config: {
    screens: {
      Player: {
        path: "player",
        screens: {
          Home: "home",
          Community: "community",
          Schedule: "schedule",
          Progress: "progress",
          Profile: "profile",
          PlayerNotifications: "notifications",
          PlayerMessages: "messages",
          Settings: "settings",
          SpotlightDetail: "spotlight/:spotlightId",
          MatchDetail: "match/:matchId",
          PlayerPublicProfile: "player-profile/:playerId",
          Shop: "shop",
          FamilyLobby: "family",
          News: "news",
          GroupDetail: "group/:groupId",
        },
      },
      Coach: {
        path: "coach",
      },
      Login: "login",
      ResetPassword: "reset-password",
      ProviderJoin: "provider-join/:token",
    },
  },
  getStateFromPath(path, options) {
    const clean = path.replace(/^\//, "");
    const match = GROUP_PATH_RE.exec(clean);
    if (match) {
      const groupId = match[1];
      return {
        routes: [
          {
            name: "Player",
            state: {
              routes: [
                { name: "GroupDetail", params: { groupId, groupName: "" } },
              ],
            },
          },
        ],
      };
    }
    return defaultGetStateFromPath(path, options);
  },
};

function AutoLockHost() {
  // Mounted inside NavigationContainer (so the active-route store is hot)
  // and inside AuthProvider (so we can read the current user). The overlay
  // reads the focused route name from the activeRoute store rather than
  // calling useNavigationState — that hook throws on cold start when used
  // outside of a navigator screen.
  const { user, isAuthenticated } = useAuth();
  return (
    <AutoLockOverlay
      enabled={isAuthenticated}
      playerId={user?.playerId || null}
      playerEmail={user?.email || null}
      playerName={(user as any)?.firstName || (user as any)?.name || null}
    />
  );
}

function NavigationContainerWithRef() {
  const navigationRef = useNavigationContainerRef();
  const { registerNavigation } = useTabNavigation();
  const [navReady, setNavReady] = useState(false);

  const handleReady = useCallback(() => {
    logger.log("[NavigationContainerWithRef] Navigation ready, registering ref");
    registerNavigation(navigationRef);
    setNavReady(true);
    // Seed the active-route store with the initial route so consumers
    // (AutoLockOverlay) get a value before the first state change fires.
    try {
      const initial = navigationRef.getCurrentRoute?.()?.name;
      if (initial) setActiveRouteName(initial);
    } catch {
      // Navigation not fully initialized yet — onStateChange will catch up.
    }
  }, [registerNavigation, navigationRef]);

  const handleStateChange = useCallback((state: any) => {
    setActiveRouteName(getDeepestRouteName(state));
  }, []);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={handleReady}
      onStateChange={handleStateChange}
      linking={linking}
    >
      <RootStackNavigator navigationRef={navReady ? navigationRef : null} />
      <AutoLockHost />
    </NavigationContainer>
  );
}

function RTLDirectionWrapper({ children }: { children: React.ReactNode }) {
  const { i18n: i18nInstance } = useTranslation();
  const direction = isRTL(i18nInstance.language) ? 'rtl' as const : 'ltr' as const;
  const rootStyle = useMemo(() => [styles.root, { direction }], [direction]);
  return <View style={rootStyle}>{children}</View>;
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);

  // On native (Expo Go / production), preload TTF files via the Metro asset system.
  // On web, preload via our Express-served /fonts/*.ttf so the browser downloads them
  // before any icon component renders — preventing the Metro CORS error fallback.
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web"
      ? {
          // Keys MUST match the fontName each icon set uses as CSS font-family on web.
          // Expo's createIconSet wrapper passes fontFile=null to the vendor, so
          // fontReference = fontFamily = fontName (exact case matters).
          ionicons: "/fonts/Ionicons.ttf",
          feather: "/fonts/Feather.ttf",
          material: "/fonts/MaterialIcons.ttf",
          anticon: "/fonts/AntDesign.ttf",
          FontAwesome: "/fonts/FontAwesome.ttf",
          entypo: "/fonts/Entypo.ttf",
          "material-community": "/fonts/MaterialCommunityIcons.ttf",
        }
      : {
          ...Ionicons.font,
          ...Feather.font,
          ...MaterialIcons.font,
          ...AntDesign.font,
          ...FontAwesome.font,
          ...Entypo.font,
          ...MaterialCommunityIcons.font,
          ...FontAwesome5.font,
        }
  );

  useEffect(() => {
    async function prepare() {
      try {
        await initializeI18n();
      } catch (e) {
        console.warn(e);
      } finally {
        setIsReady(true);
      }
    }
    prepare();
  }, []);

  useEffect(() => {
    // Drain any diagnostics reports that failed to send during a previous
    // crash session. Runs once per app cold-start; safe to fire-and-forget.
    import("@/lib/diagnostics")
      .then(({ drainPendingDiagnostics }) => drainPendingDiagnostics())
      .catch((err) => {
        if (__DEV__) console.warn("[Diagnostics] drain skipped:", err);
      });
  }, []);

  const appIsReady = isReady && (fontsLoaded || fontError != null);

  const handleSplashComplete = useCallback(() => {
    setSplashComplete(true);
  }, []);

  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <SubscriptionProvider>
          <SafeAreaProvider>
            <GestureHandlerRootView style={styles.root}>
              <KeyboardWrapper>
                <AnimatedSplashScreen isReady={appIsReady} onComplete={handleSplashComplete}>
                  <UpdateController>
                    <NetworkProvider>
                      <AppModeProvider>
                        <AuthProvider>
                          <PlayerProvider>
                            <CoachProvider>
                              <UIInteractionProvider>
                                <TabNavigationProvider>
                                  <CoachMarksProvider>
                                    <CelebrationProvider>
                                      <ThemeProvider>
                                      <AcademyThemeProvider>
                                      <WebAlertProvider>
                                        <WebContainer>
                                          <RTLDirectionWrapper>
                                            <ImpersonationBanner />
                                            <NavigationContainerWithRef />
                                            <WhatsNewGate />
                                          </RTLDirectionWrapper>
                                        </WebContainer>
                                      </WebAlertProvider>
                                      </AcademyThemeProvider>
                                      </ThemeProvider>
                                    </CelebrationProvider>
                                  </CoachMarksProvider>
                                </TabNavigationProvider>
                              </UIInteractionProvider>
                            </CoachProvider>
                          </PlayerProvider>
                        </AuthProvider>
                      </AppModeProvider>
                    </NetworkProvider>
                  </UpdateController>
                </AnimatedSplashScreen>
                <StatusBar style="light" />
              </KeyboardWrapper>
            </GestureHandlerRootView>
          </SafeAreaProvider>
          </SubscriptionProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
