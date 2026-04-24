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

  // Boot beacon (Task #1289) — proves the new OTA bundle actually evaluated
  // module-top-level on the device. Tagged with the exact OTA update id so we
  // can correlate Sentry events with the EAS dashboard. Without this, when a
  // bundle crashes during JS init we have no telemetry signal at all and can
  // only bisect blind.
  //
  // expo-updates is loaded via guarded `require` (NOT a static `import`) so
  // that a missing/broken module on web/dev cannot prevent the bundle's first
  // line of telemetry from firing. The whole block is wrapped in try/catch
  // for the same reason.
  //
  // Task #1290 — added the `react_compiler` tag so the Sentry dashboard can
  // split crash rate for REACT-NATIVE-36 (iOS Fabric MountingCoordinator
  // EXC_BAD_ACCESS) by whether the React Compiler experiment is on or off.
  // The mitigation we shipped for #1290 is `experiments.reactCompiler: false`
  // in app.json — see the post-mortem in that task's commit message and in
  // .local/tasks/task-1290.md. If the crash rate stays flat on the bundle
  // tagged `react_compiler=off`, this flip was not the trigger and the next
  // lever (per the task's bisection plan) is the upstream RN patch from
  // step 3.
  try {
    let otaUpdateId = "embedded";
    let otaRuntime = "unknown";
    let otaChannel = "unknown";
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Updates = require("expo-updates");
      if (Updates) {
        otaUpdateId = String(Updates.updateId || "embedded");
        otaRuntime = String(Updates.runtimeVersion || "unknown");
        otaChannel = String(Updates.channel || "unknown");
      }
    } catch {
      // expo-updates not present (web build, dev) — fall back to defaults.
    }
    // Commit short-SHA is injected at OTA-bundle time via EXPO_PUBLIC_COMMIT_SHA
    // (see scripts/ota-push.sh). Used for git-bisect correlation when the next
    // bundle crashes — we can map a Sentry event back to an exact commit.
    const commitSha = String(
      process.env.EXPO_PUBLIC_COMMIT_SHA || "unknown",
    ).slice(0, 12);
    // Keep this in sync with `experiments.reactCompiler` in app.json.
    // We hard-code rather than reading from Constants.expoConfig because the
    // experiments block is stripped from the runtime config in some builds,
    // and we want the tag to be authoritative for crash-rate splitting.
    const reactCompiler = "off"; // Task #1290 mitigation
    Sentry.setTag("ota_update_id", otaUpdateId);
    Sentry.setTag("ota_runtime", otaRuntime);
    Sentry.setTag("ota_channel", otaChannel);
    Sentry.setTag("ota_commit_sha", commitSha);
    Sentry.setTag("react_compiler", reactCompiler);
    Sentry.addBreadcrumb({
      category: "boot",
      level: "info",
      message: `App.tsx evaluated · ota=${otaUpdateId} rt=${otaRuntime} channel=${otaChannel} sha=${commitSha} rc=${reactCompiler}`,
    });
    Sentry.captureMessage(
      `[boot] App.tsx evaluated rt=${otaRuntime} sha=${commitSha} rc=${reactCompiler}`,
      "info",
    );
  } catch {
    // never let telemetry crash the app
  }
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
          // Task #1271 — outside-invite deep link: glowupsports://i/<token>
          // Lands on the in-app InviteClaim screen inside the Play stack.
          PlayStack: {
            screens: {
              InviteClaim: "i/:token",
            },
          },
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
  const { user } = useAuth();
  // Auto-lock inactivity overlay intentionally disabled (Task #1257);
  // set `enabled` back to `isAuthenticated` from useAuth() to re-enable.
  return (
    <AutoLockOverlay
      enabled={false}
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
    // Boot beacon #2 (Task #1289) — proves the bundle made it past JS
    // evaluation AND past auth/init AND past the first navigator render.
    // Combined with the App.tsx-eval beacon, the absence of THIS one
    // pinpoints crashes that happen between module-eval and first paint
    // (the exact failure mode that broke us this week).
    try {
      const commitSha = String(
        process.env.EXPO_PUBLIC_COMMIT_SHA || "unknown",
      ).slice(0, 12);
      Sentry.addBreadcrumb({
        category: "boot",
        level: "info",
        message: `NavigationContainer ready · sha=${commitSha}`,
      });
      Sentry.captureMessage(
        `[boot] NavigationContainer ready sha=${commitSha}`,
        "info",
      );
    } catch {
      // never let telemetry crash the app
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
