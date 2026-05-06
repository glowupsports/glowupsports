/**
 * useInterval regression tests.
 *
 * The environment is plain Node (no DOM / React renderer).  We test the
 * hook by mocking React's useEffect / useRef so that each test can drive
 * the captured effect callbacks directly with fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useInterval } from "../useInterval";

// ── minimal React hook mocks ─────────────────────────────────────────────────
type EffectFn = () => void | (() => void);

const _effects: { fn: EffectFn; deps: unknown[] | undefined }[] = [];
const _refs: { current: unknown }[] = [];
let _refIdx = 0;

vi.mock("react", () => ({
  useEffect: (fn: EffectFn, deps?: unknown[]) => {
    _effects.push({ fn, deps });
  },
  useRef: <T>(init: T) => {
    if (_refs[_refIdx] === undefined) _refs[_refIdx] = { current: init };
    return _refs[_refIdx++] as { current: T };
  },
}));

function flush() {
  const cleanups: Array<(() => void) | void> = [];
  for (const { fn } of _effects) cleanups.push(fn());
  return cleanups;
}

function unmount(cleanups: Array<(() => void) | void>) {
  for (const c of cleanups) if (typeof c === "function") c();
}

beforeEach(() => {
  vi.useFakeTimers();
  _effects.length = 0;
  _refs.length = 0;
  _refIdx = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe("useInterval — safe callback wrapper", () => {
  it("catching proof: a throwing callback is caught and does NOT crash the timer", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(String(args[0]));
    });

    let ticks = 0;
    useInterval(() => {
      ticks += 1;
      throw new Error("tick exploded");
    }, 200);

    const cleanups = flush();

    vi.advanceTimersByTime(600);

    expect(ticks).toBe(3);
    expect(errors.length).toBe(3);
    expect(errors[0]).toContain("[useInterval]");

    unmount(cleanups);
  });

  it("unmount cleanup: no ticks fire after cleanup is called", () => {
    const cb = vi.fn();
    useInterval(cb, 100);

    const cleanups = flush();

    vi.advanceTimersByTime(300);
    expect(cb).toHaveBeenCalledTimes(3);

    unmount(cleanups);
    vi.advanceTimersByTime(500);

    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("null delay: interval does not start when delayMs is null", () => {
    const cb = vi.fn();
    useInterval(cb, null);

    const cleanups = flush();

    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();

    unmount(cleanups);
  });

  it("no stacking: re-flushing the same effects produces only one active interval", () => {
    const cb = vi.fn();
    useInterval(cb, 500);

    const cleanups1 = flush();

    vi.advanceTimersByTime(1000);
    const firstCount = cb.mock.calls.length;
    expect(firstCount).toBe(2);

    // Simulate React re-running the interval effect (deps changed):
    // call cleanup, then re-invoke effects.
    unmount(cleanups1);
    const cleanups2 = flush();

    vi.advanceTimersByTime(1000);
    const secondCount = cb.mock.calls.length - firstCount;

    // Only one interval should be active — so ~2 ticks, not 4 (stacked).
    expect(secondCount).toBeLessThanOrEqual(3);

    unmount(cleanups2);
  });
});
