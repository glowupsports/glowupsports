import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";

interface Options {
  itemCount: number;
  resetKey?: string | number | null | undefined;
  threshold?: number;
}

const positionCache = new Map<string, number>();

function cacheKey(resetKey: Options["resetKey"]): string | null {
  if (resetKey === null || resetKey === undefined || resetKey === "") return null;
  return String(resetKey);
}

export function useChatStickyBottom<T = unknown>({
  itemCount,
  resetKey,
  threshold = 80,
}: Options) {
  const ref = useRef<FlatList<T>>(null);
  const isNearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const prevCountRef = useRef(0);
  const itemCountRef = useRef(itemCount);
  const currentOffsetRef = useRef(0);
  const lastContentHeightRef = useRef(0);
  const lastLayoutHeightRef = useRef(0);
  const prevResetKeyRef = useRef<string | null>(cacheKey(resetKey));
  const restoreOffsetRef = useRef<number | null>(
    (() => {
      const k = cacheKey(resetKey);
      return k != null ? positionCache.get(k) ?? null : null;
    })()
  );
  const [hasNewBelow, setHasNewBelow] = useState(false);

  itemCountRef.current = itemCount;

  const persistCurrentPosition = useCallback(
    (key: string | null) => {
      if (key == null || !initialScrollDoneRef.current) return;
      const distance =
        lastContentHeightRef.current -
        (currentOffsetRef.current + lastLayoutHeightRef.current);
      if (distance < threshold) {
        positionCache.delete(key);
      } else {
        positionCache.set(key, currentOffsetRef.current);
      }
    },
    [threshold]
  );

  useEffect(() => {
    const newKey = cacheKey(resetKey);
    const prevKey = prevResetKeyRef.current;
    if (newKey === prevKey) return;

    persistCurrentPosition(prevKey);

    prevResetKeyRef.current = newKey;
    restoreOffsetRef.current = newKey != null ? positionCache.get(newKey) ?? null : null;
    isNearBottomRef.current = true;
    initialScrollDoneRef.current = false;
    prevCountRef.current = 0;
    currentOffsetRef.current = 0;
    lastContentHeightRef.current = 0;
    setHasNewBelow(false);
  }, [resetKey, persistCurrentPosition]);

  useEffect(() => {
    return () => {
      persistCurrentPosition(prevResetKeyRef.current);
    };
  }, [persistCurrentPosition]);

  const tryInitialScroll = useCallback(() => {
    if (initialScrollDoneRef.current) return;
    if (itemCountRef.current <= 0) return;
    const h = lastContentHeightRef.current;
    const layoutH = lastLayoutHeightRef.current;
    if (h <= 0 || layoutH <= 0) return;

    const restore = restoreOffsetRef.current;
    const maxOffset = Math.max(0, h - layoutH);
    if (
      restore != null &&
      restore > 0 &&
      maxOffset > 0 &&
      restore < maxOffset - threshold
    ) {
      ref.current?.scrollToOffset({ offset: restore, animated: false });
      currentOffsetRef.current = restore;
      isNearBottomRef.current = false;
      setHasNewBelow(true);
    } else {
      ref.current?.scrollToEnd({ animated: false });
      isNearBottomRef.current = true;
    }
    initialScrollDoneRef.current = true;
    restoreOffsetRef.current = null;
  }, [threshold]);

  useEffect(() => {
    const prev = prevCountRef.current;
    if (
      itemCount > prev &&
      initialScrollDoneRef.current &&
      !isNearBottomRef.current
    ) {
      setHasNewBelow(true);
    }
    prevCountRef.current = itemCount;
    if (!initialScrollDoneRef.current && itemCount > 0) {
      const raf = requestAnimationFrame(tryInitialScroll);
      return () => cancelAnimationFrame(raf);
    }
  }, [itemCount, tryInitialScroll]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      currentOffsetRef.current = contentOffset.y;
      lastContentHeightRef.current = contentSize.height;
      lastLayoutHeightRef.current = layoutMeasurement.height;
      const distance =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const near = distance < threshold;
      isNearBottomRef.current = near;
      if (near && hasNewBelow) setHasNewBelow(false);
    },
    [hasNewBelow, threshold]
  );

  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      lastContentHeightRef.current = h;
      if (!initialScrollDoneRef.current) {
        tryInitialScroll();
        return;
      }
      if (isNearBottomRef.current) {
        ref.current?.scrollToEnd({ animated: true });
      }
    },
    [tryInitialScroll]
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      lastLayoutHeightRef.current = e.nativeEvent.layout.height;
      if (!initialScrollDoneRef.current) {
        tryInitialScroll();
      }
    },
    [tryInitialScroll]
  );

  const scrollToBottom = useCallback((animated = true) => {
    ref.current?.scrollToEnd({ animated });
    isNearBottomRef.current = true;
    setHasNewBelow(false);
    const key = prevResetKeyRef.current;
    if (key != null) positionCache.delete(key);
  }, []);

  return {
    ref,
    onScroll,
    onContentSizeChange,
    onLayout,
    scrollToBottom,
    hasNewBelow,
    scrollEventThrottle: 100,
  };
}
