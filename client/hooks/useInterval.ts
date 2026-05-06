import { useEffect, useRef } from "react";

/**
 * Safe drop-in replacement for raw setInterval in the Play tab.
 *
 * Guarantees:
 * - Callback is always wrapped in try/catch — a throwing callback logs the
 *   error and skips that tick instead of crashing the JS thread.
 * - Timer is always cleared on unmount (and before starting a new one).
 * - Passing `null` as delayMs pauses the timer without unmounting the hook.
 * - No interval stacking: the previous interval is cleared before a new one
 *   starts whenever delayMs changes.
 */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const callbackRef = useRef<() => void>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (delayMs === null) return;

    const id = setInterval(() => {
      try {
        callbackRef.current();
      } catch (err) {
        console.error("[useInterval] callback threw — tick skipped:", err);
      }
    }, delayMs);

    return () => clearInterval(id);
  }, [delayMs]);
}
