/**
 * useSafeEffect regression tests.
 *
 * Plain Node environment — React's useEffect is mocked so we can drive
 * captured effects directly without a renderer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSafeEffect } from "../useSafeEffect";

type EffectFn = () => void | (() => void) | Promise<void>;

const _effects: { fn: EffectFn; deps: unknown[] | undefined }[] = [];

vi.mock("react", () => ({
  useEffect: (fn: EffectFn, deps?: unknown[]) => {
    _effects.push({ fn, deps });
  },
}));

beforeEach(() => {
  _effects.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function flushEffects() {
  const cleanups: Array<(() => void) | void> = [];
  for (const { fn } of _effects) cleanups.push(await fn());
  return cleanups;
}

describe("useSafeEffect", () => {
  it("runs the effect body normally when it succeeds", async () => {
    const fn = vi.fn();
    useSafeEffect(fn, []);
    await flushEffects();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT propagate a synchronous error thrown inside the effect", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(String(args[0]));
    });

    useSafeEffect(() => {
      throw new Error("sync boom");
    }, []);

    let threw = false;
    try {
      await flushEffects();
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(errors.some((e) => e.includes("[useSafeEffect]"))).toBe(true);
  });

  it("does NOT propagate an async error thrown inside the effect", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(String(args[0]));
    });

    useSafeEffect(async () => {
      throw new Error("async boom");
    }, []);

    let threw = false;
    try {
      await flushEffects();
    } catch {
      threw = true;
    }

    await new Promise((r) => setTimeout(r, 0));

    expect(threw).toBe(false);
    expect(errors.some((e) => e.includes("[useSafeEffect]"))).toBe(true);
  });

  it("preserves and calls the cleanup function on unmount", async () => {
    const cleanup = vi.fn();
    useSafeEffect(() => cleanup, []);

    const cleanups = await flushEffects();
    expect(cleanup).not.toHaveBeenCalled();

    for (const c of cleanups) {
      if (typeof c === "function") c();
    }
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
