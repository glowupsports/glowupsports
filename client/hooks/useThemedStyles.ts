import { getActivePlayerScheme, getThemeRevision } from "@/constants/theme";

/**
 * Wraps a `StyleSheet.create({ ... })` call in a Proxy that re-runs the
 * factory whenever the active player scheme changes.
 *
 * Why: `StyleSheet.create` evaluates its argument once at module-load time,
 * which freezes any color tokens (e.g. `Colors.dark.backgroundRoot`) into
 * the resulting style sheet. Wrapping with `makeReactiveStyles` defers the
 * evaluation: each property access (`styles.container`) checks the active
 * scheme, re-runs the factory if needed, and returns a fresh style object.
 *
 * Combined with the player root being keyed on `resolvedScheme` so the
 * tree re-renders on toggle, this gives us full app-wide repaint without
 * per-component refactors.
 *
 * Usage:
 *   const styles = makeReactiveStyles(() => StyleSheet.create({
 *     container: { backgroundColor: Colors.dark.backgroundRoot },
 *   }));
 *
 * Note: outside the player app `getActivePlayerScheme()` always returns
 * `"dark"`, so the factory is computed once and the proxy behaves like a
 * regular static stylesheet.
 */
export function makeReactiveStyles<T extends Record<string, unknown>>(
  factory: () => T,
): T {
  let cached: T | undefined;
  let cachedRev: number | undefined;

  const ensure = (): T => {
    const rev = getThemeRevision();
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
