import { useCallback, useEffect, useRef, useState } from "react";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

interface Options {
  itemCount: number;
  resetKey?: string | number | null | undefined;
  threshold?: number;
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
  const [hasNewBelow, setHasNewBelow] = useState(false);

  useEffect(() => {
    isNearBottomRef.current = true;
    initialScrollDoneRef.current = false;
    prevCountRef.current = 0;
    setHasNewBelow(false);
  }, [resetKey]);

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
  }, [itemCount]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const distance =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const near = distance < threshold;
      isNearBottomRef.current = near;
      if (near && hasNewBelow) setHasNewBelow(false);
    },
    [hasNewBelow, threshold]
  );

  const onContentSizeChange = useCallback(() => {
    if (!initialScrollDoneRef.current) {
      ref.current?.scrollToEnd({ animated: false });
      initialScrollDoneRef.current = true;
      isNearBottomRef.current = true;
      return;
    }
    if (isNearBottomRef.current) {
      ref.current?.scrollToEnd({ animated: true });
    }
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    ref.current?.scrollToEnd({ animated });
    isNearBottomRef.current = true;
    setHasNewBelow(false);
  }, []);

  return {
    ref,
    onScroll,
    onContentSizeChange,
    scrollToBottom,
    hasNewBelow,
    scrollEventThrottle: 100,
  };
}
