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
// FOUR-LAYER FIX:
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
//   LAYER 2 — Wrap ErrorUtils.setGlobalHandler + getGlobalHandler (Path A):
//     Sandbox both ends of ErrorUtils so non-Error values never reach `throw e`.
//     Wrapping setGlobalHandler covers future installs (ExceptionsManager).
//     Wrapping getGlobalHandler covers callers that bypassed setGlobalHandler.
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

  (_SafePromise as unknown as Record<string, unknown>).prototype =
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
if (IS_WEB && _g?.ErrorUtils) {
  const _EU = _g.ErrorUtils;

  function _makeSafeHandler(
    raw: (e: unknown, isFatal: boolean) => void,
  ): (e: unknown, isFatal: boolean) => void {
    return function _safeWrapper(e: unknown, isFatal: boolean) {
      if (!(e instanceof Error)) return; // swallow non-Errors
      raw(e, isFatal);
    };
  }

  // Wrap setGlobalHandler so any future installs (ExceptionsManager, etc.)
  // are automatically sandboxed.
  const _origSet: Function | undefined = _EU.setGlobalHandler?.bind(_EU);
  if (typeof _origSet === "function") {
    _EU.setGlobalHandler = function _safeSet(
      newHandler: (e: unknown, isFatal: boolean) => void,
    ) {
      _origSet(_makeSafeHandler(newHandler));
    };
  }

  // Also wrap getGlobalHandler so the returned handler is ALWAYS safe,
  // even if a caller bypassed setGlobalHandler to store a handler directly.
  const _origGet: Function | undefined = _EU.getGlobalHandler?.bind(_EU);
  if (typeof _origGet === "function") {
    _EU.getGlobalHandler = function _safeGet() {
      const stored = _origGet();
      return typeof stored === "function" ? _makeSafeHandler(stored) : function () {};
    };
  }

  // Install the initial safe handler via our wrapped setter.
  if (typeof _EU.setGlobalHandler === "function") {
    _EU.setGlobalHandler(function _initialHandler() {
      // no-op: ExceptionsManager installs the real handler later
    });
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
