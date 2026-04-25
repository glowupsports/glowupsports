import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus ,
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

interface StoredEntry {
  offset: number;
  updatedAt: number;
}

const STORAGE_KEY = "chat_scroll_positions_v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FLUSH_DELAY_MS = 500;

const positionCache = new Map<string, StoredEntry>();
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

function hydrate(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    let prunedCount = 0;
    let totalCount = 0;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const now = Date.now();
        for (const [k, v] of Object.entries(parsed)) {
          totalCount += 1;
          if (
            v &&
            typeof v === "object" &&
            typeof (v as StoredEntry).offset === "number" &&
            typeof (v as StoredEntry).updatedAt === "number" &&
            now - (v as StoredEntry).updatedAt < MAX_AGE_MS
          ) {
            positionCache.set(k, v as StoredEntry);
          } else {
            prunedCount += 1;
          }
        }
      }
    } catch {
      // ignore
    }
    hydrated = true;
    if (prunedCount > 0 && prunedCount < totalCount) {
      void flushToStorage();
    } else if (prunedCount > 0) {
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  })();
  return hydrationPromise;
}

hydrate();

let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushToStorage() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    const now = Date.now();
    const obj: Record<string, StoredEntry> = {};
    for (const [k, v] of positionCache) {
      if (now - v.updatedAt < MAX_AGE_MS) obj[k] = v;
      else positionCache.delete(k);
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushToStorage, FLUSH_DELAY_MS);
}

function setEntry(key: string, offset: number, immediate = false) {
  positionCache.set(key, { offset, updatedAt: Date.now() });
  if (immediate) {
    void flushToStorage();
  } else {
    scheduleFlush();
  }
}

function deleteEntry(key: string, immediate = false) {
  if (positionCache.delete(key)) {
    if (immediate) {
      void flushToStorage();
    } else {
      scheduleFlush();
    }
  }
}

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
      return k != null ? positionCache.get(k)?.offset ?? null : null;
    })()
  );
  const [hasNewBelow, setHasNewBelow] = useState(false);

  itemCountRef.current = itemCount;

  const persistCurrentPosition = useCallback(
    (key: string | null, immediate = false) => {
      if (key == null || !initialScrollDoneRef.current) return;
      const distance =
        lastContentHeightRef.current -
        (currentOffsetRef.current + lastLayoutHeightRef.current);
      if (distance < threshold) {
        deleteEntry(key, immediate);
      } else {
        setEntry(key, currentOffsetRef.current, immediate);
      }
    },
    [threshold]
  );

  const tryInitialScroll = useCallback(() => {
    if (initialScrollDoneRef.current) return;
    if (itemCountRef.current <= 0) return;
    if (prevResetKeyRef.current != null && !hydrated) return;
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
    const newKey = cacheKey(resetKey);
    const prevKey = prevResetKeyRef.current;
    if (newKey === prevKey) return;

    persistCurrentPosition(prevKey);

    prevResetKeyRef.current = newKey;
    restoreOffsetRef.current =
      newKey != null ? positionCache.get(newKey)?.offset ?? null : null;
    isNearBottomRef.current = true;
    initialScrollDoneRef.current = false;
    prevCountRef.current = 0;
    currentOffsetRef.current = 0;
    lastContentHeightRef.current = 0;
    setHasNewBelow(false);
  }, [resetKey, persistCurrentPosition]);

  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    hydrate().then(() => {
      if (cancelled || initialScrollDoneRef.current) return;
      const k = prevResetKeyRef.current;
      if (k != null) {
        const entry = positionCache.get(k);
        if (entry && restoreOffsetRef.current == null) {
          restoreOffsetRef.current = entry.offset;
        }
      }
      tryInitialScroll();
    });
    return () => {
      cancelled = true;
    };
  }, [tryInitialScroll]);

  useEffect(() => {
    return () => {
      persistCurrentPosition(prevResetKeyRef.current, true);
    };
  }, [persistCurrentPosition]);

  useEffect(() => {
    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        persistCurrentPosition(prevResetKeyRef.current, true);
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [persistCurrentPosition]);

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
    if (key != null) deleteEntry(key);
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
