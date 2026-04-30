// Task #1396 — defer below-the-fold home sections (and their network calls)
// until the user actually scrolls them into view.
//
// The Player home tab used to fan out ~21 network requests at mount because
// every section — including ones below the first fold — rendered immediately.
// `LazyOnScroll` wraps a section so it only mounts when its on-screen layout
// is within `prefetchOffset` pixels of the viewport. Sections off-screen on
// cold start no longer make any HTTP calls until they actually scroll into
// view, while sections already on the first screen mount synchronously and
// look exactly the same as before.
//
// Usage:
//   const scroll = useScrollPositionController();
//   <ScrollPositionContext.Provider value={scroll.contextValue}>
//     <ScrollView onScroll={(e) => scroll.emit(
//       e.nativeEvent.contentOffset.y,
//       e.nativeEvent.layoutMeasurement.height,
//     )} scrollEventThrottle={64} ...>
//       <AboveFoldSection />
//       <LazyOnScroll><BelowFoldSection /></LazyOnScroll>
//     </ScrollView>
//   </ScrollPositionContext.Provider>
//
// Behaviour notes:
//   - One-shot reveal: once a section is mounted it stays mounted, so
//     scrolling back up doesn't re-tear-down its React Query subscriptions.
//   - `minHeight` reserves vertical space for an unrevealed section so the
//     scroll position doesn't jump as deferred sections hydrate. Pass an
//     approximate height for sections you know expand to a typical size;
//     leave at 0 for compact pills.
//   - When `LazyOnScroll` is rendered without a surrounding provider it
//     falls back to revealing immediately — keeps it safe in tests / Storybook.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  InteractionManager,
  LayoutChangeEvent,
  View,
} from "react-native";

type Listener = () => void;

interface ScrollPositionContextValue {
  subscribe: (cb: Listener) => () => void;
  getY: () => number;
  getViewportHeight: () => number;
}

export const ScrollPositionContext =
  createContext<ScrollPositionContextValue | null>(null);

interface ScrollPositionController {
  contextValue: ScrollPositionContextValue;
  emit: (y: number, viewportHeight?: number) => void;
}

export function useScrollPositionController(): ScrollPositionController {
  const scrollYRef = useRef(0);
  const viewportHeightRef = useRef(Dimensions.get("window").height);
  const listenersRef = useRef<Set<Listener>>(new Set());

  const contextValue = useMemo<ScrollPositionContextValue>(
    () => ({
      subscribe: (cb) => {
        listenersRef.current.add(cb);
        return () => {
          listenersRef.current.delete(cb);
        };
      },
      getY: () => scrollYRef.current,
      getViewportHeight: () => viewportHeightRef.current,
    }),
    [],
  );

  const emit = useCallback((y: number, viewportHeight?: number) => {
    scrollYRef.current = y;
    if (viewportHeight && viewportHeight > 0) {
      viewportHeightRef.current = viewportHeight;
    }
    listenersRef.current.forEach((cb) => cb());
  }, []);

  // Task #1456 — initial reveal-tick. iOS cold-start does not produce
  // an organic scroll event, so any LazyOnScroll child whose layoutY
  // measurement arrives after first paint (e.g. News, Coaches on the
  // player Home tab) used to wait for a manual swipe before revealing.
  // Emit one synthetic tick after the first interaction tick: every
  // already-mounted LazyOnScroll child will re-run `checkVisible()`
  // with its now-known layoutY and reveal itself if within
  // viewport + prefetchOffset. Idempotent — LazyOnScroll's reveal is
  // one-shot, so already-revealed children short-circuit.
  //
  // Two parallel paths fire the same fanOut (same idempotent set):
  //   1. InteractionManager.runAfterInteractions + 16ms — preferred,
  //      waits for the JS bridge to settle so layoutY is populated.
  //   2. 600ms hard timeout fallback — covers the worst-case where
  //      InteractionManager itself stalls during a heavy cold start.
  //   `fired` flag ensures the listeners are notified at most once even
  //   if both paths race; both paths also clean up their pending timer
  //   on unmount.
  useEffect(() => {
    let fired = false;
    let nestedTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const fanOut = () => {
      if (fired) return;
      fired = true;
      listenersRef.current.forEach((cb) => cb());
    };
    const handle = InteractionManager.runAfterInteractions(() => {
      if (fired) return;
      // Tiny defer so any onLayout pass scheduled in the same frame
      // gets a chance to populate layoutY first.
      nestedTimeoutId = setTimeout(fanOut, 16);
    });
    const fallbackTimeoutId = setTimeout(fanOut, 600);
    return () => {
      fired = true;
      if (handle && typeof handle.cancel === "function") handle.cancel();
      if (nestedTimeoutId !== null) clearTimeout(nestedTimeoutId);
      clearTimeout(fallbackTimeoutId);
    };
  }, []);

  return { contextValue, emit };
}

interface LazyOnScrollProps {
  children: React.ReactNode;
  prefetchOffset?: number;
  fallback?: React.ReactNode;
  minHeight?: number;
}

export function LazyOnScroll({
  children,
  prefetchOffset = 300,
  fallback = null,
  minHeight = 0,
}: LazyOnScrollProps) {
  const ctx = useContext(ScrollPositionContext);
  const layoutYRef = useRef<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const checkVisible = useCallback(() => {
    if (revealed) return;
    if (layoutYRef.current === null) return;
    if (!ctx) {
      setRevealed(true);
      return;
    }
    const y = ctx.getY();
    const viewportHeight = ctx.getViewportHeight();
    if (layoutYRef.current <= y + viewportHeight + prefetchOffset) {
      setRevealed(true);
    }
  }, [revealed, ctx, prefetchOffset]);

  useEffect(() => {
    if (!ctx || revealed) return;
    return ctx.subscribe(checkVisible);
  }, [ctx, revealed, checkVisible]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      layoutYRef.current = e.nativeEvent.layout.y;
      checkVisible();
    },
    [checkVisible],
  );

  return (
    <View
      onLayout={onLayout}
      style={!revealed && minHeight ? { minHeight } : undefined}
    >
      {revealed ? children : fallback}
    </View>
  );
}
