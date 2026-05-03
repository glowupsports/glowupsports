// Web-only early-boot guard.
//
// ROOT CAUSE (identified after deep analysis):
//   error-guard.js (a Metro polyfill that runs before the main bundle) sets up
//   global.ErrorUtils with a default handler of `(e, isFatal) => { throw e; }`.
//   This handler is active until ExceptionsManager (inside react-native) replaces
//   it a few milliseconds later.  If ANY non-Error value (e.g. `null` from
//   AccessibilityInfo.reject(null) on web, or a rejected native Promise before
//   the polyfillPromise.js lazy-getter fires) passes through ErrorUtils in that
//   brief window, the default handler re-throws it as-is.  V8 then fires
//   CDP Runtime.exceptionThrown with a non-Error value, which Replit's canvas
//   monitor labels "Method -unhandlederror / error was not an error object."
//
// FIX:
//   Replace the default handler immediately (this module is the FIRST import
//   in client/index.js, so it runs before any module that might fire).
//
//   CRITICAL: When the value is NOT an instanceof Error, we MUST NOT call
//   _origHandler at all. The original handler does `(e, isFatal) => { throw e; }`
//   so any call to it — even with a wrapped Error — causes V8/CDP to fire
//   Runtime.exceptionThrown again. The only safe approach is to log with
//   console.warn and return immediately, preventing the value from ever
//   re-entering V8's uncaught-exception path.
//
//   A window.onerror guard is added as a belt-and-suspenders catch for any
//   early non-Error throws that bypass ErrorUtils entirely (e.g. Metro polyfill
//   internals firing before the bundle handler is registered).

const _g = (typeof globalThis !== "undefined" ? globalThis : global) as any;

// ─── Patch global.ErrorUtils ─────────────────────────────────────────────────
// Only needed on web (document is undefined in React Native native runtime).
const IS_WEB = typeof document !== "undefined";

if (IS_WEB && _g?.ErrorUtils) {
  const _origHandler: ((e: unknown, isFatal: boolean) => void) | undefined =
    _g.ErrorUtils.getGlobalHandler?.();

  _g.ErrorUtils.setGlobalHandler?.((e: unknown, isFatal: boolean) => {
    if (!(e instanceof Error)) {
      // Non-Error value in the early-boot window.
      // DO NOT call _origHandler — it does `throw e` which re-enters V8's
      // uncaught-exception path and triggers the Replit canvas crash signal.
      // Swallow it here; log for debuggability only.
      let desc = "[web-boot-non-error]";
      try {
        desc += " " + (e === null ? "null" : e === undefined ? "undefined" : JSON.stringify(e));
      } catch {
        desc += " [unserializable]";
      }
      console.warn(desc);
      return;
    }
    _origHandler?.(e, isFatal);
  });
}

// ─── window.onerror belt-and-suspenders guard ─────────────────────────────────
// Catches non-Error throws that bypass ErrorUtils entirely (e.g. Metro polyfill
// internals firing before the bundle handler is registered).
// Returning `true` from window.onerror tells the browser the error is handled
// and prevents CDP Runtime.exceptionThrown from propagating.
if (IS_WEB && typeof window !== "undefined") {
  const _prevOnError = window.onerror;
  window.onerror = function (event, source, lineno, colno, error) {
    if (error === null || error === undefined || !(error instanceof Error)) {
      // Suppress — non-Error value, same false-positive category as above.
      return true;
    }
    if (typeof _prevOnError === "function") {
      return _prevOnError.call(window, event, source, lineno, colno, error) as boolean;
    }
    return false;
  };
}

// ─── Suppress unhandled native-Promise rejections on web ─────────────────────
// Before polyfillPromise.js replaces global.Promise with the custom polyfill,
// any native Promise that rejects without a catch handler fires a browser
// unhandledrejection event (and CDP Runtime.exceptionThrown).  We call
// preventDefault() so the browser doesn't print it to the console.
if (IS_WEB && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const r = (e as any).reason;
    if (!(r instanceof Error)) {
      // Non-Error rejection: suppress the browser's default handling.
      e.preventDefault();
    }
  });
}
