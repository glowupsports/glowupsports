import logger from "@/lib/logger";
// Web-only: redirect /coach-overview/dean/:token → /api/coach-report/dean/:token
// before React renders so the user never sees a black screen.
if (typeof window !== "undefined" && typeof window.location !== "undefined") {
  const _coachMatch = window.location.pathname.match(/^\/coach-overview\/dean\/([^/]+)/);
  if (_coachMatch) {
    window.location.replace("/api/coach-report/dean/" + _coachMatch[1] + window.location.search);
  }
}
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { StyleSheet, View, Platform } from "react-native";
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
import { NavigationContainer, LinkingOptions, useNavigationContainerRef, getStateFromPath as defaultGetStateFromPath } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n, { initializeI18n, isRTL } from "@/i18n";
import { initializeRevenueCat, SubscriptionProvider } from "@/lib/revenuecat";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, getApiUrl } from "@/lib/query-client";
import { getEnv } from "@/lib/env";

import RootStackNavigator, { RootStackParamList } from "@/navigation/RootStackNavigator";
import { AutoLockOverlay } from "@/components/AutoLockOverlay";
import { setActiveRouteName, getDeepestRouteName } from "@/lib/activeRoute";
import { useAuth , AuthProvider } from "@/coach/context/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateController } from "@/components/UpdateController";
import { ForceUpdateGate } from "@/components/ForceUpdateGate";
import { AnimatedSplashScreen } from "@/components/AnimatedSplashScreen";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { WhatsNewGate } from "@/components/WhatsNewModal";

import { PlayerProvider } from "@/context/PlayerContext";
import { AppModeProvider } from "@/context/AppModeContext";
import { NetworkProvider } from "@/context/NetworkContext";
import { CoachProvider } from "@/coach/context/CoachContext";
import { SupervisorModeProvider } from "@/context/SupervisorModeContext";
import { CoachPickerSheet } from "@/components/CoachPickerSheet";
import { UIInteractionProvider } from "@/contexts/UIInteractionContext";
import { TabNavigationProvider, useTabNavigation } from "@/components/TabNavigationContext";
import { CoachMarksProvider } from "@/components/CoachMarks";
import { CelebrationProvider } from "@/contexts/CelebrationContext";
import { AcademyThemeProvider } from "@/contexts/AcademyThemeContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { WebContainer } from "@/components/WebContainer";
import { WebAlertProvider } from "@/components/WebAlertProvider";
import { ChatStateProvider } from "@/coach/context/ChatStateContext";

// Task #1379 — RevenueCat init moved out of module-eval to a useEffect
// inside <App />. The native RNPurchases.configure() call blocks the JS
// thread for ~150-300ms on cold start (iOS, new arch / Fabric), and doing
// it before React mounts pushes first paint past the bridge-saturation
// window where PlayerProgress / Play / Community fire 11-15 parallel
// queries each. Defer it until after first paint — login/purchase paths
// don't need it before then.

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || "";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: true,
    // Task #1379 — dropped from 0.2 → 0.05. At 20% sampling Sentry's
    // performance tracer was hooking ~1 in 5 React renders + every fetch
    // on iOS Fabric, which on cold-start coincided with the 47-query
    // burst across PlayerProgress (15) + Play (11) + ProPlayerHome (21)
    // and saturated the bridge. 5% keeps enough signal for prod
    // performance dashboards without paying that tax on every session.
    tracesSampleRate: 0.05,
    environment: __DEV__ ? "development" : "production",
    beforeSend(event) {
      if (__DEV__) return null;
      // Task #1432 — drop info-level events (boot beacons, ota_boot_status,
      // ota_*_transient, ota_reload_requested) from the Sentry issues feed.
      // The diagnostic data is still attached as breadcrumbs + tags
      // (ota_update_id, ota_runtime, ota_commit_sha, boot_source, etc.) so
      // when a real warning/error/exception fires the OTA bisection context
      // is still visible on that crash event. Warnings/errors/exceptions
      // continue through untouched.
      if (event.level === "info") return null;
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
    let appVersion = "unknown";
    let isEmbeddedLaunch: boolean | null = null;
    let isEmergencyLaunch: boolean | null = null;
    let createdAt: string | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Updates = require("expo-updates");
      if (Updates) {
        otaUpdateId = String(Updates.updateId || "embedded");
        otaRuntime = String(Updates.runtimeVersion || "unknown");
        otaChannel = String(Updates.channel || "unknown");
        isEmbeddedLaunch =
          typeof Updates.isEmbeddedLaunch === "boolean"
            ? Updates.isEmbeddedLaunch
            : null;
        isEmergencyLaunch =
          typeof Updates.isEmergencyLaunch === "boolean"
            ? Updates.isEmergencyLaunch
            : null;
        createdAt = Updates.createdAt
          ? new Date(Updates.createdAt).toISOString()
          : null;
      }
    } catch {
      // expo-updates not present (web build, dev) — fall back to defaults.
    }
    try {
      // `nativeApplicationVersion` lives in `expo-application`, not
      // `expo-updates`. Guarded require for the same reason as above.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Application = require("expo-application");
      appVersion = String(
        Application?.nativeApplicationVersion || "unknown",
      );
    } catch {
      // module missing — leave default.
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
    // Task #1306 — boot_source disambiguates "running on the OTA bundle"
    // from "fell back to the embedded bundle baked into the binary". When
    // expo-updates can't load the latest update (corruption, signature
    // failure, emergency launch), it boots the embedded bundle silently.
    // Without this tag, we can't tell from Sentry whether an OTA actually
    // landed on a device.
    const bootSource =
      isEmbeddedLaunch === true
        ? "embedded"
        : isEmbeddedLaunch === false
          ? "ota"
          : "unknown";
    Sentry.setTag("ota_update_id", otaUpdateId);
    Sentry.setTag("ota_runtime", otaRuntime);
    Sentry.setTag("ota_channel", otaChannel);
    Sentry.setTag("ota_commit_sha", commitSha);
    Sentry.setTag("react_compiler", reactCompiler);
    Sentry.setTag("boot_source", bootSource);
    Sentry.setTag("ota_app_version", appVersion);
    Sentry.setTag("ota_is_embedded_launch", String(isEmbeddedLaunch));
    Sentry.setTag("ota_is_emergency_launch", String(isEmergencyLaunch));
    Sentry.addBreadcrumb({
      category: "boot",
      level: "info",
      message: `App.tsx evaluated · ota=${otaUpdateId} rt=${otaRuntime} channel=${otaChannel} sha=${commitSha} rc=${reactCompiler} src=${bootSource}`,
      data: {
        platform: Platform.OS,
        appVersion,
        runtimeVersion: otaRuntime,
        channel: otaChannel,
        updateId: otaUpdateId,
        createdAt,
        isEmbeddedLaunch,
        isEmergencyLaunch,
        commitSha,
      },
    });
    Sentry.captureMessage(
      `[boot] App.tsx evaluated rt=${otaRuntime} sha=${commitSha} rc=${reactCompiler} src=${bootSource}`,
      "info",
    );
  } catch {
    // never let telemetry crash the app
  }
}

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
const ACADEMY_SLUG_PATH_RE = /^academy\/([a-zA-Z0-9\-_]+)$/;

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
    const groupMatch = GROUP_PATH_RE.exec(clean);
    if (groupMatch) {
      const groupId = groupMatch[1];
      return {
        routes: [
          {
            name: "PlayerV2",
            state: {
              routes: [
                { name: "GroupDetail", params: { groupId, groupName: "" } },
              ],
            },
          },
        ],
      };
    }
    // Task #1604 — academy public profile share link: academy/<slug>
    // Lands on AcademySlugResolver which resolves slug → academyId then
    // navigates to AcademyPublicProfile (PlayerAcademyProfileScreen).
    const academyMatch = ACADEMY_SLUG_PATH_RE.exec(clean);
    if (academyMatch) {
      const slug = academyMatch[1];
      return {
        routes: [
          {
            name: "PlayerV2",
            state: {
              index: 1,
              routes: [
                { name: "PlayerV2Home" },
                { name: "AcademySlugResolver", params: { slug } },
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
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
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
      <RootStackNavigator navigationRef={navReady ? navigationRef : null as any} />
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
  // Task #1474 — `useIosPaintTick` / `IosPaintFlush` removed. Those
  // existed to flush iOS Fabric commits the player tree was leaving
  // pending on cold start, and the only reason it left them pending
  // was the persisted-cache + deferred-hydrate stack we also removed
  // in this task. With the player surface back to coach-style
  // synchronous bootstrap there is nothing to flush.

  // On native (Expo Go / production), preload TTF files via the Metro asset system.
  // On web, preload via our Express-served /fonts/*.ttf so the browser downloads them
  // before any icon component renders — preventing the Metro CORS error fallback.
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web"
      ? (() => {
          // Keys MUST exactly match fontBasename used by @expo/vector-icons on web:
          // fontBasename = fontFile without extension (e.g. "Ionicons.ttf" → "Ionicons").
          // React Native Web looks up fontFamily via JS — case-sensitive, so
          // "ionicons" ≠ "Ionicons". Use relative URLs so fonts resolve from
          // whichever domain serves the app (glowupsports.com or replit.app).
          return {
            Ionicons: "/fonts/Ionicons.ttf",
            Feather: "/fonts/Feather.ttf",
            MaterialIcons: "/fonts/MaterialIcons.ttf",
            AntDesign: "/fonts/AntDesign.ttf",
            FontAwesome: "/fonts/FontAwesome.ttf",
            Entypo: "/fonts/Entypo.ttf",
            MaterialCommunityIcons: "/fonts/MaterialCommunityIcons.ttf",
          };
        })()
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
    // Skip on web — the module has no meaningful work to do there and
    // a failed import() rejects with a non-Error which triggers a false
    // crash signal in Replit's canvas monitor.
    if (Platform.OS === "web") return;
    import("@/lib/diagnostics")
      .then(({ drainPendingDiagnostics }) => drainPendingDiagnostics())
      .catch((err) => {
        if (__DEV__) console.warn("[Diagnostics] drain skipped:", err);
      });
  }, []);

  useEffect(() => {
    // Task #1418 — bridge RN AppState + NetInfo into React Query's
    // focusManager + onlineManager so backgrounding/foregrounding the
    // app and toggling connectivity actually trigger react-query's
    // built-in revalidation. The bridge is started AFTER mount and
    // intentionally never fires `setFocused(true)` synchronously, so
    // it doesn't perturb the cold-start render. See
    // client/lib/queryAppStateBridge.ts for the full rationale.
    //
    // Skip on web — @react-native-community/netinfo has no browser
    // entry point so the import() rejects with a non-Error plain object,
    // triggering a false crash signal in Replit's canvas monitor.
    // React Query's built-in web focus/online listeners are sufficient.
    if (Platform.OS === "web") return;
    let stop: (() => void) | undefined;
    import("@/lib/queryAppStateBridge")
      .then(({ startQueryAppStateBridge }) => {
        stop = startQueryAppStateBridge();
      })
      .catch((err) => {
        if (__DEV__) {
          console.warn("[queryAppStateBridge] start skipped:", err);
        }
      });
    return () => {
      try {
        stop?.();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    // Task #1379 — lazy RevenueCat init. Was previously a synchronous
    // module-eval call (see header comment near the Sentry block) which
    // blocked first paint by ~150-300ms on iOS Fabric. Deferring to after
    // mount via setTimeout(0) lets React commit the splash/initial frame
    // first; the paywall and subscription queries don't read from
    // Purchases until the user navigates to a gated surface, well after
    // this resolves. Wrapped in try/catch so a missing native SDK can't
    // crash the app on web/dev.
    const handle = setTimeout(() => {
      try {
        initializeRevenueCat();
      } catch (err: unknown) {
        if (__DEV__) {
          console.warn(
            "[RevenueCat] Init skipped:",
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }, 0);
    return () => clearTimeout(handle);
  }, []);

  const appIsReady = isReady && (fontsLoaded || fontError != null);

  const handleSplashComplete = useCallback(() => {
    setSplashComplete(true);
    // Task #1394 observability: emit a Sentry breadcrumb the moment
    // the splash dismisses (i.e. first frame the user actually sees).
    // Pairs with `godCache hydrate start/end` and `first-god-fetch-settled`
    // breadcrumbs from queryCachePersist to give ops a complete picture
    // of cold-start timing without needing another OTA push.
    import("@/lib/queryCachePersist")
      .then(({ markColdStartFirstPaint }) => markColdStartFirstPaint())
      .catch(() => {
        // never throw past the splash-complete callback
      });
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
                          <SupervisorModeProvider>
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
                                            <ChatStateProvider>
                                              <NavigationContainerWithRef />
                                            </ChatStateProvider>
                                            <CoachPickerSheet />
                                            <WhatsNewGate />
                                            <ForceUpdateGate />
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
                          </SupervisorModeProvider>
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
