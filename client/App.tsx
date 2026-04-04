import logger from "@/lib/logger";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { StyleSheet, View, Platform, Alert } from "react-native";
import { NavigationContainer, NavigationContainerRef, LinkingOptions, useNavigationContainerRef, getStateFromPath as defaultGetStateFromPath } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n, { initializeI18n, isRTL } from "@/i18n";
import { initializeRevenueCat, SubscriptionProvider } from "@/lib/revenuecat";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const KeyboardProvider: React.ComponentType<{ children: React.ReactNode }> = isExpoGo
  ? ({ children }) => <>{children}</>
  : require("react-native-keyboard-controller").KeyboardProvider;

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

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateController } from "@/components/UpdateController";
import { AnimatedSplashScreen } from "@/components/AnimatedSplashScreen";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

import { PlayerProvider } from "@/context/PlayerContext";
import { AppModeProvider } from "@/context/AppModeContext";
import { NetworkProvider } from "@/context/NetworkContext";
import { CoachProvider } from "@/coach/context/CoachContext";
import { AuthProvider } from "@/coach/context/AuthContext";
import { UIInteractionProvider } from "@/contexts/UIInteractionContext";
import { TabNavigationProvider, useTabNavigation } from "@/components/TabNavigationContext";
import { CoachMarksProvider } from "@/components/CoachMarks";
import { CelebrationProvider } from "@/contexts/CelebrationContext";
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

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

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

function NavigationContainerWithRef() {
  const navigationRef = useNavigationContainerRef();
  const { registerNavigation } = useTabNavigation();
  const [navReady, setNavReady] = useState(false);
  
  const handleReady = useCallback(() => {
    logger.log("[NavigationContainerWithRef] Navigation ready, registering ref");
    registerNavigation(navigationRef);
    setNavReady(true);
  }, [registerNavigation, navigationRef]);
  
  return (
    <NavigationContainer ref={navigationRef} onReady={handleReady} linking={linking}>
      <RootStackNavigator navigationRef={navReady ? navigationRef : null} />
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

  useEffect(() => {
    async function prepare() {
      try {
        await initializeI18n();
        await Promise.all([
          new Promise(resolve => setTimeout(resolve, 500)),
        ]);
      } catch (e) {
        console.warn(e);
      } finally {
        setIsReady(true);
      }
    }
    prepare();
  }, []);

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
                <AnimatedSplashScreen isReady={isReady} onComplete={handleSplashComplete}>
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
                                      <WebAlertProvider>
                                        <WebContainer>
                                          <RTLDirectionWrapper>
                                            <ImpersonationBanner />
                                            <NavigationContainerWithRef />
                                          </RTLDirectionWrapper>
                                        </WebContainer>
                                      </WebAlertProvider>
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
