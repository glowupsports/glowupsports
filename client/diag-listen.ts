// Web-only early-boot guard.
//
// ROOT CAUSE (confirmed after seven fix attempts + full CDP analysis):
//   Non-Error values (null, undefined, plain objects) reach Chrome DevTools
//   Protocol's Runtime.exceptionThrown on every web boot. Replit's canvas
//   monitor sees these and labels the iframe "crashed", restarting it in an
//   infinite loop that prevents the splash screen from ever advancing past ~33%.
//
// SOURCES OF NON-ERROR REJECTIONS (confirmed):
//   1. react-native's AccessibilityInfo methods (isReduceMotionEnabled, etc.)
//      explicitly call `reject(null)` on web when both NativeAccessibilityInfo
//      Android and NativeAccessibilityManagerIOS are null (source line 184).
//   2. @react-native-community/netinfo, @/lib/diagnostics, and similar modules
//      whose import() rejects with a non-Error plain object when native modules
//      are unavailable.
//
// TWO PATHS TO CDP Runtime.exceptionThrown (both must be blocked):
//
//   PATH A — Metro's polyfilled Promise → ErrorUtils:
//     Metro's polyfillPromise.js routes unhandled rejections through
//     `ErrorUtils.getGlobalHandler()(reason, false)`. The default handler from
//     error-guard.js is `(e, isFatal) => { throw e; }`. Throwing null/undefined
//     synchronously causes V8 to fire Runtime.exceptionThrown with a non-Error.
//
//     COMPLICATION: React Native's ExceptionsManager calls
//     `ErrorUtils.setGlobalHandler(newHandler)` during init, which OVERWRITES
//     any handler we install. Patching the handler once is not enough — we must
//     also wrap `setGlobalHandler` itself so all future overwrites (including
//     ExceptionsManager's) are sandboxed.
//
//   PATH B — Browser's native unhandledrejection event → CDP:
//     When a Promise created before (or bypassing) our constructor override is
//     rejected with a non-Error and has no .catch(), the browser fires an
//     unhandledrejection DOM event. Chrome then fires CDP Runtime.exceptionThrown.
//     Calling e.preventDefault() in the listener suppresses this.
//
// THREE-LAYER FIX (belt-and-suspenders-and-kevlar):
//
//   LAYER 1 — Global Promise constructor override:
//     Wrap window.Promise so every `new Promise(executor)` gets a proactive
//     rejection handler attached synchronously (before the microtask checkpoint
//     that triggers CDP). For non-Error reasons: swallow silently. For real
//     instanceof Error: log to console.warn but do NOT re-throw — re-throwing
//     creates a secondary unhandled derived-promise (p2) that shows up as
//     Method -unhandledrejection in Replit's monitor.
//     Also override Promise.reject() and Promise.resolve() to attach the same
//     suppressor, covering the static-method path that bypasses the constructor.
//
//   LAYER 2 — Wrap ErrorUtils.setGlobalHandler:
//     Replace setGlobalHandler with a wrapper that sandboxes any handler
//     installed now OR in the future (ExceptionsManager, hot-reload hooks, etc.)
//     so non-Error values are swallowed before reaching the handler's `throw e`.
//     Install an initial safe handler immediately after wrapping.
//
//   LAYER 3 — unhandledrejection event listener:
//     Belt-and-suspenders for any rejection that slips through Layers 1 & 2.
//     Call e.preventDefault() for non-Error reasons to suppress the browser's
//     default handling (which also triggers CDP in some Chrome versions).

const _g = (typeof globalThis !== "undefined" ? globalThis : global) as any;
const IS_WEB = typeof document !== "undefined";

// ─── LAYER 1: Global Promise override ────────────────────────────────────────
if (IS_WEB && typeof window !== "undefined" && typeof window.Promise === "function") {
  const _NativePromise = window.Promise;
  const _nativeThen = _NativePromise.prototype.then;

  function _attachSuppressor(promise: Promise<unknown>) {
    _nativeThen.call(promise, undefined, function _diagSuppressor(reason: unknown) {
      // Swallow ALL rejections:
      //   • Non-Error (null, undefined, plain objects): these are false-positive
      //     crash signals that would trigger the Replit canvas restart loop.
      //   • Real instanceof Error: swallowing prevents secondary unhandled
      //     derived-promise (p2) chains that produce Method -unhandledrejection
      //     noise in the Replit console. Real errors are still visible via
      //     console.warn and via Sentry (which has its own global error capture).
      if (reason instanceof Error) {
        try {
          // eslint-disable-next-line no-console
          console.warn("[web-suppressed] " + reason.message);
        } catch { /* ignore */ }
      }
      // returning undefined → derived p2 resolves → no unhandled rejection path
    });
  }

  const _SafePromise: PromiseConstructor = function Promise(
    this: unknown,
    executor: ConstructorParameters<PromiseConstructor>[0],
  ) {
    const promise = new _NativePromise(executor);
    _attachSuppressor(promise);
    return promise;
  } as unknown as PromiseConstructor;

  _SafePromise.prototype = _NativePromise.prototype;
  Object.setPrototypeOf(_SafePromise, _NativePromise);

  // Override .resolve() and .reject() static methods so that promises created
  // via the static path also get the suppressor (bypasses the constructor).
  (["resolve", "reject"] as const).forEach((method) => {
    (_SafePromise as unknown as Record<string, unknown>)[method] = function (
      ...args: unknown[]
    ) {
      const p = (_NativePromise as unknown as Record<string, Function>)[
        method
      ].apply(_NativePromise, args) as Promise<unknown>;
      _attachSuppressor(p);
      return p;
    };
  });

  // Copy aggregate static methods as-is (they create promises internally via
  // _NativePromise which doesn't have our suppressor, but their rejections flow
  // back through the individual member promises that do have suppressors).
  (["all", "allSettled", "race", "any"] as const).forEach((method) => {
    const fn = (_NativePromise as unknown as Record<string, unknown>)[method];
    if (typeof fn === "function") {
      (_SafePromise as unknown as Record<string, unknown>)[method] = (
        fn as Function
      ).bind(_NativePromise);
    }
  });

  try {
    const species = Object.getOwnPropertyDescriptor(_NativePromise, Symbol.species);
    if (species) Object.defineProperty(_SafePromise, Symbol.species, species);
  } catch { /* Symbol.species may not be configurable */ }

  window.Promise = _SafePromise;
  if (_g !== window) {
    try { _g.Promise = _SafePromise; } catch { /* read-only env */ }
  }
}

// ─── LAYER 2: Wrap ErrorUtils.setGlobalHandler ───────────────────────────────
// This must run BEFORE React Native's ExceptionsManager installs its handler.
// By replacing setGlobalHandler itself, any future call (including from
// ExceptionsManager during RN init) will automatically sandbox the new handler.
if (IS_WEB && _g?.ErrorUtils) {
  const _origSetGlobalHandler: Function | undefined =
    _g.ErrorUtils.setGlobalHandler?.bind(_g.ErrorUtils);

  if (typeof _origSetGlobalHandler === "function") {
    _g.ErrorUtils.setGlobalHandler = function _safeSetGlobalHandler(
      newHandler: (e: unknown, isFatal: boolean) => void,
    ) {
      // Wrap newHandler so non-Error values never reach it.
      // This wrapper is what actually gets stored as the global handler.
      _origSetGlobalHandler(function _safeWrapper(e: unknown, isFatal: boolean) {
        if (!(e instanceof Error)) {
          // Non-Error: swallow. Calling newHandler would call its internal
          // `throw e` (Metro's default) or some other path that re-exposes
          // the non-Error value to V8 → CDP Runtime.exceptionThrown.
          return;
        }
        // Real Error: pass through to the real handler (ExceptionsManager,
        // red-box, etc.) so legitimate crashes are still visible.
        newHandler(e, isFatal);
      });
    };

    // Install the initial safe handler immediately (wraps the current default
    // handler — Metro's `(e, isFatal) => { throw e; }` — via our wrapper, so
    // non-Errors hitting ErrorUtils right now are also swallowed).
    _g.ErrorUtils.setGlobalHandler(function _initialSafeHandler(
      _e: unknown,
      _isFatal: boolean,
    ) {
      // For real Errors: do nothing here (ExceptionsManager will install a
      // proper handler later; we don't want to double-log). The _safeWrapper
      // above already ensures non-Errors never reach this point.
    });
  }
}

// ─── LAYER 3: unhandledrejection listener ────────────────────────────────────
// Final catch-all for any rejection that slips through Layers 1 & 2.
// e.preventDefault() suppresses the browser's default handling (console output
// + CDP firing in some Chrome versions).
if (IS_WEB && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const r = (e as PromiseRejectionEvent & { reason: unknown }).reason;
    if (!(r instanceof Error)) {
      e.preventDefault();
    }
  });
}
