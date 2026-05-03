// Web-only early-boot guard.
//
// ROOT CAUSE (confirmed after six fix attempts):
//   During the first ~200ms of the web bundle evaluation, one or more Promises
//   are rejected with non-Error values (null, undefined, or plain objects).
//   The most likely sources:
//     • react-native's AccessibilityInfo.isReduceMotionEnabled() / isBoldTextEnabled()
//       etc., all of which explicitly call `reject(null)` on web because both
//       NativeAccessibilityInfoAndroid and NativeAccessibilityManagerIOS are null.
//     • Any library that probes native RN APIs during module init on web.
//
//   When a Promise is rejected with a non-Error value and has no `.catch()`:
//     1. The native Promise microtask checkpoint fires.
//     2. V8/Chrome fires CDP Runtime.exceptionThrown with a non-Error payload.
//     3. Replit's canvas monitor sees this → marks the iframe as "crashed".
//     4. The canvas refreshes the iframe → new boot cycle → same rejection → loop.
//   Result: splash screen is permanently stuck at ~33% (always showing because
//   the iframe is restarted every ~750 ms, before the 2-second animation ends).
//
// WHY PREVIOUS FIXES FAILED (Task #1647):
//   1. `ErrorUtils.setGlobalHandler` — may be a no-op on web if Metro's
//      error-guard.js doesn't make `ErrorUtils` available in globalThis by
//      the time diag-listen.ts evaluates. The `[web-boot-non-error]` console.warn
//      never appeared in production logs, confirming the handler was not called.
//   2. `window.onerror` returning `true` — applies only to synchronous throws,
//      not to Promise rejections. Unhandled rejections never reach window.onerror.
//   3. `e.preventDefault()` on `unhandledrejection` — Chrome fires CDP
//      Runtime.exceptionThrown during the microtask checkpoint that detects the
//      unhandled rejection. The browser-level `unhandledrejection` event fires
//      AFTER that, so calling preventDefault() is too late to suppress CDP.
//      (Verified: diagnostic script in index.html added `[unhandledrejection-diag]`
//      logs that never appeared, meaning unhandledrejection wasn't even firing —
//      the rejection may be going through Metro's polyfilled Promise → ErrorUtils
//      → throw, bypassing the browser rejection event entirely.)
//
// THE FIX:
//   Override the global Promise constructor so that every newly created Promise
//   gets a proactive rejection handler attached immediately (within the same
//   synchronous execution block), before the microtask checkpoint that triggers
//   CDP. For non-Error rejection reasons, the handler swallows the rejection
//   (preventing CDP). For real `instanceof Error` values, the handler re-throws
//   so that CDP still fires and the crash is visible. User code's own `.catch()`
//   handlers on the original promise object are unaffected — attaching our
//   suppressor to the promise is equivalent to the user having a catch handler,
//   but the original promise object still delivers the rejection to any other
//   handlers attached to it (they share the same underlying state).
//
//   Belt-and-suspenders: keep the ErrorUtils patch (in case ErrorUtils IS
//   available on some web configurations) and the unhandledrejection listener
//   (in case a rejection slips through the Promise override, e.g. from
//   Promise.reject() called without `new`).

const _g = (typeof globalThis !== "undefined" ? globalThis : global) as any;
const IS_WEB = typeof document !== "undefined";

// ─── 1. Global Promise constructor override ───────────────────────────────────
// Must run first, before any import that might create a rejecting Promise.
if (IS_WEB && typeof window !== "undefined" && typeof window.Promise === "function") {
  const _NativePromise = window.Promise;
  const _nativeThen = _NativePromise.prototype.then;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _SafePromise: PromiseConstructor = function Promise(
    this: unknown,
    executor: ConstructorParameters<PromiseConstructor>[0],
  ) {
    const promise = new _NativePromise(executor);

    // Attach a suppressor immediately so the rejection is "handled" before the
    // microtask checkpoint that triggers CDP Runtime.exceptionThrown.
    // Using the stored _nativeThen avoids triggering our override recursively.
    _nativeThen.call(promise, undefined, function diagSuppressor(reason: unknown) {
      if (!(reason instanceof Error)) {
        // Non-Error rejection (e.g. null from AccessibilityInfo on web).
        // Swallow silently — this is a false-positive that would trigger the
        // Replit canvas crash loop.
        return;
      }
      // Real Error: re-throw so CDP still fires and the crash is visible.
      throw reason;
    });

    return promise;
  } as unknown as PromiseConstructor;

  // Copy prototype so `promise instanceof Promise` still works.
  _SafePromise.prototype = _NativePromise.prototype;
  Object.setPrototypeOf(_SafePromise, _NativePromise);

  // Copy static methods.
  (["resolve", "reject", "all", "allSettled", "race", "any"] as const).forEach(
    (method) => {
      const fn = (_NativePromise as unknown as Record<string, unknown>)[method];
      if (typeof fn === "function") {
        (_SafePromise as unknown as Record<string, unknown>)[method] =
          (fn as Function).bind(_NativePromise);
      }
    },
  );

  try {
    // Also copy Symbol.species so subclassing still works.
    const species = Object.getOwnPropertyDescriptor(_NativePromise, Symbol.species);
    if (species) {
      Object.defineProperty(_SafePromise, Symbol.species, species);
    }
  } catch {
    // Symbol.species may not be configurable; ignore.
  }

  window.Promise = _SafePromise;
  // Also patch globalThis so Metro's polyfill (which may read globalThis.Promise)
  // sees the safe version.
  if (_g !== window) {
    try { _g.Promise = _SafePromise; } catch { /* read-only env */ }
  }
}

// ─── 2. Patch global.ErrorUtils (belt-and-suspenders) ────────────────────────
// On some Metro web configurations ErrorUtils IS available and is the path that
// unhandled-rejection-via-throw travels. Keep the patch for those environments.
if (IS_WEB && _g?.ErrorUtils) {
  const _origHandler: ((e: unknown, isFatal: boolean) => void) | undefined =
    _g.ErrorUtils.getGlobalHandler?.();

  _g.ErrorUtils.setGlobalHandler?.((e: unknown, isFatal: boolean) => {
    if (!(e instanceof Error)) {
      // Non-Error value — swallow. DO NOT call _origHandler (it does `throw e`).
      return;
    }
    _origHandler?.(e, isFatal);
  });
}

// ─── 3. unhandledrejection listener (belt-and-suspenders) ────────────────────
// Catches any rejection that somehow bypasses the Promise override
// (e.g. Promise.reject() called on the original constructor reference).
// Note: preventDefault() alone does not suppress CDP in all Chrome versions,
// but combined with the Promise override above it provides defense-in-depth.
if (IS_WEB && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const r = (e as PromiseRejectionEvent & { reason: unknown }).reason;
    if (!(r instanceof Error)) {
      e.preventDefault();
    }
  });
}
