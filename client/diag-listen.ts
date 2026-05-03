// Web-only early-boot guard.
//
// ROOT CAUSE (confirmed, eight-attempt analysis):
//   Non-Error values (null, undefined, plain objects) reach Chrome DevTools
//   Protocol's Runtime.exceptionThrown on every web boot. Replit's canvas
//   monitor sees these and labels the iframe "crashed", restarting it in an
//   infinite loop that prevents the splash screen from completing.
//
// THREE ESCAPE PATHS that all must be blocked:
//
//   PATH A — Metro's ErrorUtils → synchronous throw:
//     Metro's polyfillPromise.js routes unhandled rejections through
//     `ErrorUtils.getGlobalHandler()(reason, false)`. The default handler is
//     `(e, isFatal) => { throw e; }`. Throwing null/undefined synchronously
//     fires Runtime.exceptionThrown.
//
//   PATH B — Derived .then() chain promises:
//     When code calls promise.then(onFulfilled) without a rejection handler,
//     a NEW derived promise is created. Our constructor override suppresses the
//     source promise, but NOT the derived one — which goes unhandled → CDP.
//     Example: Promise.reject(null).then(handler) creates P_derived (unhandled).
//
//   PATH C — Native async function rejections:
//     async/await in V8 uses native PromiseReactionJobs, not window.Promise.
//     Overriding the constructor alone does NOT intercept these rejections.
//     They go straight to V8's unhandled-rejection machinery → CDP.
//
// FIVE-LAYER FIX:
//
//   LAYER 0 — Patch Promise.prototype.then (covers Paths B + C):
//     The prototype is shared by ALL promises — including native async ones and
//     derived .then() results. By injecting our suppressor as the default
//     rejection handler whenever no onRejected is provided, we ensure EVERY
//     un-caught promise chain terminates with our suppressor rather than going
//     unhandled. .catch(handler) is unaffected (onRejected is provided).
//
//   LAYER 1 — Constructor + static method override (belt-and-suspenders):
//     Wrap window.Promise so new Promise(executor), Promise.reject(),
//     Promise.resolve() also proactively attach our suppressor. Redundant with
//     Layer 0 for most cases but covers edge cases where .then() is not called.
//
//   LAYER 2 — Wrap ErrorUtils fully (Path A) — two sub-fixes applied:
//     a) Timing gap: ErrorUtils may not exist when this module evaluates.
//        Metro assigns it during polyfill setup. Fix: Object.defineProperty
//        intercepts the assignment so we patch immediately when it lands.
//     b) Direct-call gap: reportFatalError/reportError call _globalHandler as
//        a private variable, bypassing setGlobalHandler/getGlobalHandler.
//        Fix: wrap those two methods so non-Errors are swallowed before they
//        can reach ExceptionsManager's handler (which creates SyntheticError
//        and throws, firing Runtime.exceptionThrown before window.onerror).
//
//   LAYER 3 — unhandledrejection DOM event (final fallback):
//     For any rejection that slips through Layers 0–2, call e.preventDefault()
//     on ALL rejections. In Chrome, this suppresses Runtime.exceptionThrown when
//     the event fires before the CDP notification is sent.

const _g = (typeof globalThis !== "undefined" ? globalThis : global) as any;
const IS_WEB = typeof document !== "undefined";

if (IS_WEB && typeof window !== "undefined" && typeof window.Promise === "function") {
  const _NativePromise = window.Promise;

  // Shared suppressor — handles rejection from any layer.
  // For real Errors: log so they remain visible in the console.
  // For non-Errors: silently swallow (false-positive crash signals).
  // Always returns undefined so the derived promise resolves (not rejects).
  function _diagSuppressor(reason: unknown): undefined {
    if (reason instanceof Error) {
      try {
        // eslint-disable-next-line no-console
        console.warn("[web-suppressed] " + reason.message);
      } catch { /* ignore */ }
    }
    return undefined;
  }

  // Capture the original .then() BEFORE patching so layers can call it safely.
  const _origThen = _NativePromise.prototype.then;

  // ── LAYER 0: Patch Promise.prototype.then ──────────────────────────────────
  // By patching the prototype shared by ALL promises (including native async
  // function promises and derived .then() results), we ensure every promise
  // chain ends with our suppressor when no rejection handler is provided.
  // .catch(handler) calls .then(undefined, handler) — handler is preserved.
  try {
    (_NativePromise.prototype as Record<string, unknown>).then =
      function _patchedThen(
        this: Promise<unknown>,
        onFulfilled?: unknown,
        onRejected?: unknown,
      ): Promise<unknown> {
        return _origThen.call(
          this,
          onFulfilled,
          (onRejected !== undefined && onRejected !== null)
            ? onRejected
            : _diagSuppressor,
        );
      };
  } catch { /* read-only in some sandboxed envs — layer 0 skipped */ }

  // ── LAYER 1: Global Promise constructor + static method override ───────────
  function _attachSuppressor(promise: Promise<unknown>) {
    // Use the ORIGINAL .then() to avoid double-wrapping through Layer 0.
    _origThen.call(promise, undefined, _diagSuppressor);
  }

  const _SafePromise: PromiseConstructor = function Promise(
    this: unknown,
    executor: ConstructorParameters<PromiseConstructor>[0],
  ) {
    const promise = new _NativePromise(executor);
    _attachSuppressor(promise);
    return promise;
  } as unknown as PromiseConstructor;

  // Copy prototype so `promise instanceof Promise` still works.
  // Cast through unknown to bypass TypeScript's readonly constraint on Function.prototype.
  (_SafePromise as unknown as { prototype: unknown }).prototype =
    _NativePromise.prototype;
  Object.setPrototypeOf(_SafePromise, _NativePromise);

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

// ── LAYER 2: Wrap ErrorUtils (Path A — Metro's synchronous throw) ─────────────
//
// TWO GAPS the original implementation had:
//
//   GAP A — Timing: ErrorUtils may not exist in globalThis at module-load
//     time. Metro assigns it during polyfill setup, AFTER diag-listen.ts
//     evaluates. The old `if (_g?.ErrorUtils)` check silently skipped the
//     entire layer when that happened. Fix: also intercept the assignment
//     via Object.defineProperty so we patch it the moment it lands.
//
//   GAP B — Direct call: reportFatalError / reportError call the private
//     _globalHandler variable directly, bypassing both setGlobalHandler and
//     getGlobalHandler wrappers entirely. So even when the wrappers were in
//     place, a non-Error flowing through reportFatalError still reached
//     ExceptionsManager's handler, which wrapped it in SyntheticError and
//     threw — triggering Runtime.exceptionThrown via CDP before window.onerror
//     could intercept. Fix: wrap reportFatalError + reportError too.
//
if (IS_WEB) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function _patchErrorUtils(eu: any) {
    if (!eu || eu.__diagPatched) return;
    eu.__diagPatched = true;

    function _makeSafeHandler(
      raw: (e: unknown, isFatal: boolean) => void,
    ): (e: unknown, isFatal: boolean) => void {
      return function _safeWrapper(e: unknown, isFatal: boolean) {
        if (!(e instanceof Error)) return; // swallow non-Errors
        raw(e, isFatal);
      };
    }

    // Wrap setGlobalHandler so future installs (ExceptionsManager, Sentry)
    // are automatically sandboxed.
    const _origSet: Function | undefined = eu.setGlobalHandler?.bind(eu);
    if (typeof _origSet === "function") {
      eu.setGlobalHandler = function _safeSet(
        newHandler: (e: unknown, isFatal: boolean) => void,
      ) {
        _origSet(_makeSafeHandler(newHandler));
      };
    }

    // Wrap getGlobalHandler so callers that bypassed setGlobalHandler are safe.
    const _origGet: Function | undefined = eu.getGlobalHandler?.bind(eu);
    if (typeof _origGet === "function") {
      eu.getGlobalHandler = function _safeGet() {
        const stored = _origGet();
        return typeof stored === "function"
          ? _makeSafeHandler(stored as (e: unknown, isFatal: boolean) => void)
          : function () {};
      };
    }

    // Wrap reportFatalError + reportError — these call _globalHandler as a
    // PRIVATE variable, bypassing both get/setGlobalHandler wrappers above
    // (GAP B). Without this, non-Errors still reach ExceptionsManager which
    // wraps them in SyntheticError and throws, firing Runtime.exceptionThrown
    // via CDP before window.onerror can intercept it.
    const _origReportFatal: Function | undefined = eu.reportFatalError?.bind(eu);
    if (typeof _origReportFatal === "function") {
      eu.reportFatalError = function _safeReportFatal(error: unknown) {
        if (!(error instanceof Error)) return; // swallow non-Errors
        _origReportFatal(error);
      };
    }

    const _origReportError: Function | undefined = eu.reportError?.bind(eu);
    if (typeof _origReportError === "function") {
      eu.reportError = function _safeReportError(error: unknown) {
        if (!(error instanceof Error)) return; // swallow non-Errors
        _origReportError(error);
      };
    }

    // Install initial safe no-op handler via our wrapped setter.
    if (typeof eu.setGlobalHandler === "function") {
      eu.setGlobalHandler(function _initialHandler() {
        // no-op: ExceptionsManager installs the real handler later
      });
    }
  }

  // Patch immediately if ErrorUtils is already present at module-load time.
  if (_g?.ErrorUtils) _patchErrorUtils(_g.ErrorUtils);

  // Intercept future assignment of ErrorUtils to globalThis (GAP A fix).
  // Metro assigns ErrorUtils during polyfill setup, after this module runs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _euStorage: any = _g?.ErrorUtils;
  try {
    Object.defineProperty(_g, "ErrorUtils", {
      configurable: true,
      enumerable: true,
      get() {
        return _euStorage;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(val: any) {
        _euStorage = val;
        _patchErrorUtils(val);
      },
    });
  } catch {
    /* defineProperty may fail in restricted envs — immediate patch above is the fallback */
  }
}

// ── LAYER 3: unhandledrejection DOM event (final fallback) ────────────────────
// Prevent ALL unhandled rejections from reaching CDP. Layer 0 should have
// handled them already, but this catches anything that slips through.
if (IS_WEB && typeof window !== "undefined") {
  window.addEventListener(
    "unhandledrejection",
    (e: PromiseRejectionEvent) => {
      e.preventDefault();
    },
    true, // capture phase: runs before any other listener
  );
}

// ── LAYER 4: window.onerror — synchronous throw suppressor ───────────────────
//
// ROOT CAUSE (confirmed via eight-attempt analysis):
//   Sentry.init() — called in App.tsx during module evaluation, AFTER
//   diag-listen.ts runs — overwrites window.onerror with its own handler.
//   Sentry's handler does NOT return true for non-Error thrown values, so
//   Chrome sends Runtime.exceptionThrown to the CDP. Replit's canvas monitor
//   sees this and labels the iframe "crashed".
//
// The ONLY mechanism that suppresses Runtime.exceptionThrown is window.onerror
// returning true. Calling e.preventDefault() on the 'error' event does NOT
// suppress the CDP notification — only window.onerror return value does.
//
// THE FIX: Use Object.defineProperty to intercept every future assignment to
// window.onerror. Our setter wraps each new handler with a suppressor that
// returns true for non-Error thrown values, BEFORE delegating to the handler.
// This way, even when Sentry (or any other library) does window.onerror = fn,
// our suppressor is ALWAYS in the chain, and we always return true first.
//
// We suppress when:
//   a) message contains "not an error object" — ExceptionsManager's wrapper text
//   b) !(error instanceof Error) — catches null, undefined, strings, plain objects
//      (null instanceof Error → false, undefined instanceof Error → false) ✓
//
// Layer 4a: capture-phase 'error' event (belt-and-suspenders for browsers where
//   the property-setter approach is unavailable).
// Layer 4b: Object.defineProperty getter/setter for window.onerror.
if (IS_WEB && typeof window !== "undefined") {
  // ── Layer 4a: capture-phase 'error' event ─────────────────────────────────
  // Distinguishes JS runtime errors (e.target === window) from resource load
  // failures (e.target is an HTMLElement) so we don't suppress image/script
  // load errors.
  window.addEventListener(
    "error",
    (e: ErrorEvent) => {
      const isJsRuntimeError =
        e.target === window || e.error !== undefined;
      if (isJsRuntimeError) {
        if (
          (typeof e.message === "string" &&
            e.message.includes("not an error object")) ||
          !(e.error instanceof Error)
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    },
    true,
  );

  // ── Layer 4b: Intercept window.onerror via Object.defineProperty ───────────
  // Wraps EVERY future onerror assignment so our suppressor is always first.
  const _WRAPPED = Symbol("__diagListenWrapped");
  type WrappedOnerror = typeof window.onerror & { [_WRAPPED]?: true };

  function _wrapOnerror(handler: typeof window.onerror): typeof window.onerror {
    if (typeof handler !== "function") return handler;
    const fn = handler as WrappedOnerror;
    if (fn[_WRAPPED]) return handler; // already wrapped — avoid double-wrapping
    function _suppressingOnerror(
      this: typeof globalThis,
      message: string | Event,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error,
    ): boolean {
      if (
        (typeof message === "string" &&
          message.includes("not an error object")) ||
        !(error instanceof Error)
      ) {
        return true; // suppress — prevents Runtime.exceptionThrown
      }
      return (
        (handler as NonNullable<typeof window.onerror>).call(
          this,
          message,
          source,
          lineno,
          colno,
          error,
        ) ?? false
      );
    }
    (_suppressingOnerror as WrappedOnerror)[_WRAPPED] = true;
    return _suppressingOnerror;
  }

  let _onerrorStored: typeof window.onerror = _wrapOnerror(window.onerror);
  try {
    Object.defineProperty(window, "onerror", {
      get(): typeof window.onerror {
        return _onerrorStored;
      },
      set(newHandler: typeof window.onerror): void {
        _onerrorStored = _wrapOnerror(newHandler);
      },
      configurable: true,
      enumerable: true,
    });
  } catch {
    /* non-configurable in some restricted envs — Layer 4a is the fallback */
  }
}
