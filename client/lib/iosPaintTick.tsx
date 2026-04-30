// Task #1407 — iOS cold-start paint-tick helper.
//
// Background: after the splash dismisses on iOS Fabric, React sometimes
// holds a pending commit until a real input/layout event (gesture,
// AppState change) flushes it. The visible symptom is the player tabs
// (Home / Community / Play / Growth / Me) sitting on a spinner for
// 30–60 s after a cold start until the user swipes or opens the
// app-switcher. See docs/sentry-cold-start-dashboard.md §7 for the
// full post-mortem and the "Why we force repaint on iOS" section.
//
// The fix is a deliberate opacity micro-nudge (1.000 ↔ 0.999) on a
// View wrapping the navigator, bumped:
//   - at +300 ms after splashComplete
//   - at +1000 ms after splashComplete
//   - at +2000 ms, +3500 ms, +5000 ms, +8000 ms after splashComplete
//     (Task #1456 — covers god-routes that resolve >1 s, e.g. Growth /
//     Me where slow tournament/profile branches keep `isLoading` true
//     past the original two ticks and otherwise leave the screen
//     stuck on its skeleton until the user swipes)
//   - on every AppState 'active' event after splashComplete
// The delta is visually imperceptible but is enough to force iOS to
// re-commit the view tree, simulating the gesture that would otherwise
// be needed.
//
// HARD RULES (mirrored in replit.md — keep both in sync):
//   - The wrapper style MUST stay inline. Do NOT extract to useMemo,
//     do NOT pull into StyleSheet.create, do NOT factor into a deeper
//     child. Inline guarantees a re-render on every tick.
//   - The navigator child must NOT carry `key={tick}` (or any other
//     key tied to the tick). Keying the navigator would remount
//     providers and reset the queryClient.
//   - The `cold-start` / `ios-paint-tick` breadcrumb and the
//     `ios.paint_tick_ms` measurement feed Panel 5 of the Sentry
//     cold-start dashboard. If you rename or remove either, update
//     `docs/sentry-cold-start-dashboard.md` in the same change.

import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import * as Sentry from "@sentry/react-native";

export function useIosPaintTick(splashComplete: boolean): number {
  const [iosPaintTick, setIosPaintTick] = useState(0);
  // Captured the moment splashComplete flips true so each bump can
  // report `ms_since_first_paint` for the dashboard. Effects run after
  // the same commit that sets splashComplete, so this is captured
  // within ~1 frame of the splash actually dismissing — close enough
  // for a cold-start measurement bucketed in 100 ms increments.
  const splashCompleteAt = useRef<number>(0);

  useEffect(() => {
    if (splashComplete && splashCompleteAt.current === 0) {
      splashCompleteAt.current = Date.now();
    }
  }, [splashComplete]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (!splashComplete) return;
    let firstTickEmitted = false;
    const bump = (
      src:
        | "t300"
        | "t1000"
        | "t2000"
        | "t3500"
        | "t5000"
        | "t8000"
        | "appstate",
    ) => {
      requestAnimationFrame(() => {
        setIosPaintTick((t) => t + 1);
        try {
          const elapsedMs = splashCompleteAt.current
            ? Date.now() - splashCompleteAt.current
            : 0;
          Sentry.addBreadcrumb?.({
            category: "cold-start",
            level: "info",
            message: "ios-paint-tick",
            data: { src, ms_since_first_paint: elapsedMs },
          });
          if (!firstTickEmitted) {
            firstTickEmitted = true;
            // Cold-start dashboard panel "iOS paint-tick wait time p50/p95"
            // (see docs/sentry-cold-start-dashboard.md).
            Sentry.setMeasurement?.(
              "ios.paint_tick_ms",
              elapsedMs,
              "millisecond",
            );
          }
        } catch {
          // never throw past the paint-tick scheduler
        }
      });
    };
    const t1 = setTimeout(() => bump("t300"), 300);
    const t2 = setTimeout(() => bump("t1000"), 1000);
    // Task #1456 — extra bumps for god-routes that resolve later than
    // the original 1 s ceiling. Without these, screens whose `isLoading`
    // flips false at e.g. 1.4 s sit on their skeleton until a manual
    // swipe forces Fabric to flush. Each extra bump is cheap (one
    // requestAnimationFrame + one state set) and they short-circuit
    // through React's bailout once the screen has already painted.
    const t3 = setTimeout(() => bump("t2000"), 2000);
    const t4 = setTimeout(() => bump("t3500"), 3500);
    const t5 = setTimeout(() => bump("t5000"), 5000);
    const t6 = setTimeout(() => bump("t8000"), 8000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") bump("appstate");
    });
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
      sub.remove();
    };
  }, [splashComplete]);

  return iosPaintTick;
}

// Wrapper that applies the inline opacity nudge driven by the tick.
// MUST stay inline — see HARD RULES at the top of this file.
export function IosPaintFlush({
  tick,
  children,
}: {
  tick: number;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        opacity: Platform.OS === "ios" ? 1 - (tick % 2) * 0.001 : 1,
      }}
    >
      {children}
    </View>
  );
}
