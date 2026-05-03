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
//   in client/index.js, so it runs before any module that might fire).  The
//   replacement wraps non-Error values in an Error before re-throwing so that
//   V8/CDP sees a proper Error object, not null/string/etc.
//
//   We also intercept window.unhandledrejection (for native Promises that slip
//   through before polyfillPromise.js is evaluated) and call preventDefault()
//   to suppress the browser's default unhandled-rejection behaviour.
//   Note: CDP Runtime.exceptionThrown fires before the browser event, so
//   preventDefault() alone cannot stop it — the ErrorUtils patch above is the
//   primary fix.

const _g = (typeof globalThis !== "undefined" ? globalThis : global) as any;

// ─── Patch global.ErrorUtils ─────────────────────────────────────────────────
// Only needed on web (document is undefined in React Native native runtime).
const IS_WEB = typeof document !== "undefined";

if (IS_WEB && _g?.ErrorUtils) {
  const _origHandler: ((e: unknown, isFatal: boolean) => void) | undefined =
    _g.ErrorUtils.getGlobalHandler?.();

  _g.ErrorUtils.setGlobalHandler?.((e: unknown, isFatal: boolean) => {
    if (!(e instanceof Error)) {
      // Non-Error in the early-boot window: wrap so V8 sees an Error, not null.
      // This stops Replit's monitor from flagging "Method -unhandlederror".
      let msg = "[web-boot-non-error]";
      try {
        msg += " " + (e === null ? "null" : e === undefined ? "undefined" : JSON.stringify(e));
      } catch {
        msg += " [unserializable]";
      }
      const wrapped = new Error(msg);
      _origHandler?.(wrapped, isFatal);
      return;
    }
    _origHandler?.(e, isFatal);
  });
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
