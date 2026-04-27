// Task #1418 — PlayerContext defers its `/api/player/me` query off the
// cold-start critical path. We can't render <PlayerProvider /> in
// vitest-node (no React renderer is wired up in this repo's test
// config), so this suite covers the *underlying mechanism* via the
// extracted `scheduleDeferredFlip` helper and the exported
// `PLAYER_ME_DEFER_MS` constant.
//
// The shape of these assertions mirrors the queryCachePersist tests
// (#1394): we verify the InteractionManager-pending case still flips
// via the hard-timeout fallback, the InteractionManager-resolves-first
// case never double-fires, and cleanup cancels both paths.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PlayerContext pulls in `@/lib/logger` (which references the RN
// `__DEV__` global) and `@/coach/context/AuthContext` transitively.
// Stub both so vitest-node can resolve the import graph without
// rendering the full app.
vi.mock("@/lib/logger", () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/coach/context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

const interactionCancel = vi.fn();
let interactionCallback: (() => void) | null = null;

vi.mock("react-native", () => ({
  InteractionManager: {
    runAfterInteractions: (cb: () => void) => {
      // Capture the callback so individual tests can choose to fire it
      // (mirrors the splash-still-animating vs splash-done branches on
      // an actual device).
      interactionCallback = cb;
      return { cancel: interactionCancel };
    },
  },
  Platform: { OS: "ios" },
}));

beforeEach(() => {
  interactionCallback = null;
  interactionCancel.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PlayerContext deferral — module exports", () => {
  it("PLAYER_ME_DEFER_MS is 600ms on iOS (matches the #1394 fallback budget)", async () => {
    const { PLAYER_ME_DEFER_MS } = await import(
      "@/player/context/PlayerContext"
    );
    expect(PLAYER_ME_DEFER_MS).toBe(600);
  });
});

describe("PlayerContext deferral — scheduleDeferredFlip", () => {
  it("does NOT call the flip function synchronously", async () => {
    // The whole point of the deferral is to keep the cold-start render
    // unblocked. If scheduleDeferredFlip fired the flip during the call
    // itself, useState in PlayerProvider would re-render before React
    // has even committed the initial frame.
    const { scheduleDeferredFlip } = await import(
      "@/player/context/PlayerContext"
    );
    const flip = vi.fn();
    scheduleDeferredFlip(flip);
    expect(flip).not.toHaveBeenCalled();
  });

  it("fires the flip via the hard-timeout fallback when InteractionManager never resolves (the splash-stuck-on-iOS scenario)", async () => {
    const { scheduleDeferredFlip } = await import(
      "@/player/context/PlayerContext"
    );
    const flip = vi.fn();
    scheduleDeferredFlip(flip);

    // Advance just past the 600ms iOS budget. The captured
    // interactionCallback is intentionally NOT invoked — that simulates
    // the splash animation holding the InteractionManager queue open
    // forever, which is the exact bug #1394 documented.
    await vi.advanceTimersByTimeAsync(700);
    expect(flip).toHaveBeenCalledOnce();
  });

  it("fires the flip via InteractionManager when it resolves before the timeout", async () => {
    const { scheduleDeferredFlip } = await import(
      "@/player/context/PlayerContext"
    );
    const flip = vi.fn();
    scheduleDeferredFlip(flip);

    // Simulate InteractionManager flushing well under the 600ms budget.
    expect(interactionCallback).toBeTruthy();
    interactionCallback!();
    expect(flip).toHaveBeenCalledOnce();

    // The hard-timeout would still fire next, but the internal `ran`
    // guard must collapse it to a no-op — flip must remain at 1 call.
    await vi.advanceTimersByTimeAsync(700);
    expect(flip).toHaveBeenCalledOnce();
  });

  it("when both paths fire, the flip runs exactly once (idempotent)", async () => {
    const { scheduleDeferredFlip } = await import(
      "@/player/context/PlayerContext"
    );
    const flip = vi.fn();
    scheduleDeferredFlip(flip);

    interactionCallback!();
    await vi.advanceTimersByTimeAsync(700);
    // Even with both InteractionManager AND the timeout invoking the
    // inner flip, the per-call `ran` flag means flipFn fires once.
    expect(flip).toHaveBeenCalledOnce();
  });

  it("the returned cleanup cancels BOTH the InteractionManager handle and the timer", async () => {
    const { scheduleDeferredFlip } = await import(
      "@/player/context/PlayerContext"
    );
    const flip = vi.fn();
    const cleanup = scheduleDeferredFlip(flip);

    cleanup();
    expect(interactionCancel).toHaveBeenCalledOnce();

    // After cleanup the timer must NOT fire — clearTimeout took it out
    // of the queue.
    await vi.advanceTimersByTimeAsync(700);
    expect(flip).not.toHaveBeenCalled();
  });
});
