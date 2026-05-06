import { useEffect, DependencyList } from "react";

type SafeEffectCallback = () =>
  | void
  | (() => void | undefined)
  | Promise<void | (() => void | undefined)>;

/**
 * Thin wrapper around useEffect that wraps the effect body in try/catch.
 *
 * Unhandled async errors inside useEffect are a common freeze vector — they
 * escape the component and can crash the JS thread. This hook catches them,
 * logs them with console.error, and lets the component continue rendering.
 *
 * The cleanup return value (if any) is preserved and called on unmount exactly
 * as standard useEffect does.
 *
 * Signature mirrors useEffect exactly so it can be dropped in as a replacement.
 */
export function useSafeEffect(
  effect: SafeEffectCallback,
  deps?: DependencyList,
): void {
  useEffect(() => {
    let cleanup: (() => void | undefined) | undefined;

    const run = async () => {
      try {
        const result = effect();
        if (result instanceof Promise) {
          const resolved = await result;
          if (typeof resolved === "function") {
            cleanup = resolved;
          }
        } else if (typeof result === "function") {
          cleanup = result;
        }
      } catch (err) {
        console.error("[useSafeEffect] effect threw:", err);
      }
    };

    run();

    return () => {
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
