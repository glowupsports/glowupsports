// Task #1418 — bridge React Native AppState + NetInfo into React Query's
// focusManager + onlineManager.
//
// Background: react-query ships with a built-in window-focus / online
// listener that targets the web (`window` events). On React Native the
// equivalent signals come from `AppState` (foreground/background) and
// `NetInfo` (connectivity). Without a bridge, a backgrounded iOS app
// returning to the foreground does NOT notify react-query, so any stale
// god-route data sits in the cache until the next user-initiated swipe
// — which is exactly the symptom #1418 is chasing on the Player tabs.
//
// Why this is bridged from a separate module instead of inlined into
// App.tsx:
//   1. App.tsx already mounts ~25 providers; one more concern doesn't
//      help readability.
//   2. The bridge needs unit-test coverage that asserts no synchronous
//      `setFocused(true)` call happens at module-eval time. That's
//      easier to assert against a thin standalone helper than to test
//      around the entire App.tsx mount.
//
// CRITICAL: this file MUST NOT call `focusManager.setFocused(true)` or
// `onlineManager.setOnline(true)` at module-eval time. React Query's
// defaults already assume both managers report focused/online; firing a
// synchronous "true" notification on import would (a) cause every
// observer mounted up to that moment to re-evaluate before the rest of
// the cold-start work is finished, and (b) defeat the whole point of
// the deferred network work in PlayerContext + queryCachePersist.

import { focusManager, onlineManager } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
import type { AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import type { NetInfoState } from "@react-native-community/netinfo";

export type QueryAppStateBridgeStop = () => void;

/**
 * Wires AppState → focusManager.setFocused() and NetInfo →
 * onlineManager.setOnline(). Returns a teardown function that removes
 * both subscriptions.
 *
 * Call this exactly once, AFTER `<QueryClientProvider>` has mounted.
 * The default React Query state (focused=true, online=true) means there
 * is nothing to do at the mount edge — the bridge only matters from
 * the next AppState/NetInfo event onwards.
 */
export function startQueryAppStateBridge(): QueryAppStateBridgeStop {
  const handleAppStateChange = (state: AppStateStatus) => {
    // "active" → focused; everything else (background, inactive, unknown)
    // → not focused. We deliberately do not special-case "inactive"
    // (the brief transition state on iOS) so that the brief blip during
    // a sheet present / FaceID prompt doesn't pause queries longer than
    // necessary — the next "active" event will flip us back instantly.
    focusManager.setFocused(state === "active");
  };
  const appStateSub = AppState.addEventListener(
    "change",
    handleAppStateChange,
  );

  // NetInfo is not available on web; the QueryClient's default `online`
  // state is already correct there (it follows navigator.onLine via
  // react-query's web defaults). Skip the subscription on web to avoid
  // a runtime error from the RN package's web shim.
  let netInfoUnsubscribe: (() => void) | undefined;
  if (Platform.OS !== "web") {
    netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // `isConnected` is `null` while NetInfo is still computing. Treat
      // null as "online" so we don't pause the entire query layer
      // during that brief window — false positives on offline are
      // worse for cold start than false positives on online.
      onlineManager.setOnline(state.isConnected ?? true);
    });
  }

  return () => {
    try {
      appStateSub.remove();
    } catch {
      // ignore — sub may have already been removed in fast-refresh
    }
    if (netInfoUnsubscribe) {
      try {
        netInfoUnsubscribe();
      } catch {
        // ignore
      }
    }
  };
}
