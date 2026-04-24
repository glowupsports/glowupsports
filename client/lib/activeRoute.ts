// Lightweight, navigator-agnostic store of the currently focused route name.
//
// Why: components mounted at the NavigationContainer level (not inside a
// screen) can't safely call `useNavigationState` — in React Navigation v7 it
// throws "Couldn't get the navigation state. Is your component inside a
// navigator?" on cold start. We instead push the active route name from
// `NavigationContainer.onStateChange` into this module, and let consumers
// subscribe via the `useActiveRouteName` hook.
//
// ⚠️ Sanctioned APIs for components mounted as siblings of
// `NavigationContainer` (e.g. `AutoLockOverlay` in `client/App.tsx`):
//
//   1. `useActiveRouteName()` — convenient hook, fine for most call sites.
//   2. `getActiveRouteName()` + `subscribeActiveRoute()` — imperative
//      pair; use this when the call site needs to wrap the route read in
//      a try/catch (hooks can't be wrapped). Prefer this in code paths
//      where a thrown exception during route resolution would crash the
//      whole RN tree (lock overlay, error boundary fallbacks, etc.).
//
// Do NOT introduce `useNavigationState`, `useRoute`, `useNavigation` or
// any other React Navigation hook into those sibling components — they
// throw on cold start because there is no NavigationContext above them.
// See Task #1237 and Task #1249 for the crash this module guards
// against. Inside a Screen (i.e. below a Navigator), prefer React
// Navigation's own hooks.

import { useEffect, useState } from "react";

type Listener = (routeName: string | undefined) => void;

let activeRouteName: string | undefined;
const listeners = new Set<Listener>();

/** Walk a (possibly nested) navigation state and return the deepest focused
 *  route's name. Mirrors the previous `useNavigationState` selector logic. */
export function getDeepestRouteName(state: any): string | undefined {
  if (!state) return undefined;
  let s: any = state;
  while (s?.routes && s.index != null) {
    const r = s.routes[s.index];
    if (!r?.state) return r?.name as string | undefined;
    s = r.state;
  }
  return undefined;
}

export function getActiveRouteName(): string | undefined {
  return activeRouteName;
}

/** Push the latest active route into the store. No-op if unchanged. */
export function setActiveRouteName(next: string | undefined): void {
  if (activeRouteName === next) return;
  activeRouteName = next;
  for (const fn of listeners) fn(activeRouteName);
}

/** Subscribe to route changes. Returns an unsubscribe function. */
export function subscribeActiveRoute(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** React hook — re-renders when the active route name changes. */
export function useActiveRouteName(): string | undefined {
  const [name, setName] = useState<string | undefined>(activeRouteName);
  useEffect(() => subscribeActiveRoute(setName), []);
  return name;
}
