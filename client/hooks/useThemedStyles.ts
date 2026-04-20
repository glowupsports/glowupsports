import { useTheme } from "@/contexts/ThemeContext";
import { _getThemeRevisionInternal } from "@/contexts/ThemeContext";

/**
 * Subscribes the calling component to the active theme so it re-renders
 * whenever the scheme or academy theme changes.
 *
 * @deprecated Task #823 — read colours via `useTheme()` instead. This hook
 * exists only for legacy screens that still rely on `makeReactiveStyles`
 * + module-level `Colors.dark.*` snapshots; migrating those screens lets
 * us delete this hook entirely.
 */
export function useThemeReactivity(): number {
  // useTheme() consumes ThemeContext, so the calling component re-renders
  // on every scheme / academy theme change just like before. We return
  // the internal revision number for parity with the old API.
  useTheme();
  return _getThemeRevisionInternal();
}

/**
 * Wraps a `StyleSheet.create({ ... })` call in a Proxy that re-runs the
 * factory whenever the active theme revision changes (player scheme or
 * academy overlay).
 *
 * @deprecated Task #823 — new code should call `useTheme()` and build
 * styles inside the component (e.g. via `useMemo`). This wrapper is kept
 * only so the ~240 legacy call-sites continue to flip on light/dark
 * without an immediate file-by-file migration. The proxy is purely a
 * read-time helper now: the underlying revision counter is bumped only
 * by `<ThemeProvider>`'s `useLayoutEffect`, so render-time mutation
 * (the Task #822 footgun) is no longer possible.
 */
export function makeReactiveStyles<T extends Record<string, unknown>>(
  factory: () => T,
): T {
  let cached: T | undefined;
  let cachedRev: number | undefined;

  const ensure = (): T => {
    const rev = _getThemeRevisionInternal();
    if (rev !== cachedRev || cached === undefined) {
      cached = factory();
      cachedRev = rev;
    }
    return cached;
  };

  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      const target = ensure() as Record<string | symbol, unknown>;
      return Reflect.get(target, prop, receiver);
    },
    has(_target, prop) {
      return prop in ensure();
    },
    ownKeys() {
      return Reflect.ownKeys(ensure() as object);
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(ensure() as object, prop);
    },
  }) as T;
}
