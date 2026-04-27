// Task #1418 — unit tests for the AppState/NetInfo → React Query bridge.
//
// What we are nailing down:
//   1. Importing the module does NOT call `focusManager.setFocused(true)`
//      synchronously (that would defeat the cold-start deferrals in
//      PlayerContext + queryCachePersist).
//   2. AppState "change" → focused/not-focused flip.
//   3. NetInfo connectivity changes → onlineManager.setOnline.
//   4. Returned teardown removes BOTH subscriptions.
//   5. On web, NetInfo is intentionally NOT subscribed (RN web shim).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks ----------------------------------------------------------------

type AppStateListener = (state: string) => void;
type NetInfoListener = (state: { isConnected: boolean | null }) => void;

let appStateListener: AppStateListener | null = null;
const appStateRemove = vi.fn(() => {
  appStateListener = null;
});
const appStateAddEventListener = vi.fn(
  (event: string, cb: AppStateListener) => {
    if (event !== "change") {
      throw new Error(`unexpected AppState event: ${event}`);
    }
    appStateListener = cb;
    return { remove: appStateRemove };
  },
);

let netInfoListener: NetInfoListener | null = null;
const netInfoUnsubscribe = vi.fn(() => {
  netInfoListener = null;
});
const netInfoAddEventListener = vi.fn((cb: NetInfoListener) => {
  netInfoListener = cb;
  return netInfoUnsubscribe;
});

const setFocused = vi.fn();
const setOnline = vi.fn();

// Mutable Platform.OS so individual tests can flip to "web" without
// having to re-mock the whole react-native module.
const platformOS = { current: "ios" as "ios" | "web" };

vi.mock("@tanstack/react-query", () => ({
  focusManager: {
    setFocused: (...args: unknown[]) => setFocused(...args),
  },
  onlineManager: {
    setOnline: (...args: unknown[]) => setOnline(...args),
  },
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (event: string, cb: AppStateListener) =>
      appStateAddEventListener(event, cb),
  },
  // Platform is read every call site, so a getter on `OS` lets a test
  // mutate `platformOS.current` to switch behaviour without remounting
  // the entire mock graph (which collides with closure capture).
  get Platform() {
    return {
      get OS() {
        return platformOS.current;
      },
    };
  },
}));

vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: (cb: NetInfoListener) => netInfoAddEventListener(cb),
  },
}));

beforeEach(() => {
  appStateListener = null;
  netInfoListener = null;
  platformOS.current = "ios";
  setFocused.mockClear();
  setOnline.mockClear();
  appStateAddEventListener.mockClear();
  appStateRemove.mockClear();
  netInfoAddEventListener.mockClear();
  netInfoUnsubscribe.mockClear();
});

afterEach(() => {
  // Intentionally NOT calling vi.doUnmock("react-native") here. The
  // first iteration of this test file did, and the unmock-then-import
  // sequence in the next test silently swapped in the real react-native
  // module — which has no spy plumbing, so every AppState assertion
  // failed. Mocks stay live for the whole file.
});

// ---- tests ----------------------------------------------------------------

describe("queryAppStateBridge — module-eval safety", () => {
  it("importing the module does NOT call focusManager.setFocused synchronously", async () => {
    // This is the load-bearing assertion the task spec calls out:
    // a synchronous setFocused(true) here would cause every observer
    // mounted up to that point to re-evaluate before cold-start work
    // has finished, undoing the PlayerContext + queryCachePersist
    // deferrals. Importing must be a no-op until startQueryAppStateBridge
    // is called.
    await import("@/lib/queryAppStateBridge");
    expect(setFocused).not.toHaveBeenCalled();
    expect(setOnline).not.toHaveBeenCalled();
    expect(appStateAddEventListener).not.toHaveBeenCalled();
    expect(netInfoAddEventListener).not.toHaveBeenCalled();
  });

  it("calling startQueryAppStateBridge does NOT fire setFocused(true) synchronously either", async () => {
    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    const stop = startQueryAppStateBridge();
    // Subscriptions are wired…
    expect(appStateAddEventListener).toHaveBeenCalled();
    expect(netInfoAddEventListener).toHaveBeenCalled();
    // …but no notification has been emitted. React Query's defaults
    // already assume focused/online; we only react to *changes*.
    expect(setFocused).not.toHaveBeenCalled();
    expect(setOnline).not.toHaveBeenCalled();
    stop();
  });
});

describe("queryAppStateBridge — AppState wiring", () => {
  it("AppState 'active' flips focusManager.setFocused(true)", async () => {
    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    startQueryAppStateBridge();
    expect(appStateListener).toBeTruthy();
    appStateListener!("active");
    expect(setFocused).toHaveBeenLastCalledWith(true);
  });

  it("AppState 'background' flips focusManager.setFocused(false)", async () => {
    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    startQueryAppStateBridge();
    appStateListener!("background");
    expect(setFocused).toHaveBeenLastCalledWith(false);
  });

  it("AppState 'inactive' is treated as not-focused (transitional state)", async () => {
    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    startQueryAppStateBridge();
    appStateListener!("inactive");
    expect(setFocused).toHaveBeenLastCalledWith(false);
  });
});

describe("queryAppStateBridge — NetInfo wiring", () => {
  it("NetInfo isConnected=true → onlineManager.setOnline(true)", async () => {
    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    startQueryAppStateBridge();
    expect(netInfoListener).toBeTruthy();
    netInfoListener!({ isConnected: true });
    expect(setOnline).toHaveBeenLastCalledWith(true);
  });

  it("NetInfo isConnected=false → onlineManager.setOnline(false)", async () => {
    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    startQueryAppStateBridge();
    netInfoListener!({ isConnected: false });
    expect(setOnline).toHaveBeenLastCalledWith(false);
  });

  it("NetInfo isConnected=null is treated as online (avoids pausing the entire query layer during the brief 'computing' window)", async () => {
    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    startQueryAppStateBridge();
    netInfoListener!({ isConnected: null });
    expect(setOnline).toHaveBeenLastCalledWith(true);
  });
});

describe("queryAppStateBridge — cleanup", () => {
  it("the returned teardown removes BOTH the AppState and NetInfo subscriptions", async () => {
    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    const stop = startQueryAppStateBridge();
    expect(appStateRemove).not.toHaveBeenCalled();
    expect(netInfoUnsubscribe).not.toHaveBeenCalled();
    stop();
    expect(appStateRemove).toHaveBeenCalledOnce();
    expect(netInfoUnsubscribe).toHaveBeenCalledOnce();
  });

  it("teardown is idempotent — a second call does not re-throw", async () => {
    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    const stop = startQueryAppStateBridge();
    stop();
    // Second call: the subscription objects are already gone; the
    // bridge swallows any errors so React strict-mode double-invoke
    // doesn't crash the app.
    expect(() => stop()).not.toThrow();
  });
});

describe("queryAppStateBridge — web platform", () => {
  it("on Platform.OS === 'web', NetInfo is NOT subscribed (the RN package's web shim throws)", async () => {
    platformOS.current = "web";

    const { startQueryAppStateBridge } = await import(
      "@/lib/queryAppStateBridge"
    );
    const stop = startQueryAppStateBridge();
    expect(appStateAddEventListener).toHaveBeenCalledOnce();
    expect(netInfoAddEventListener).not.toHaveBeenCalled();
    // Teardown of an unsubscribed NetInfo path must not throw.
    expect(() => stop()).not.toThrow();
    expect(netInfoUnsubscribe).not.toHaveBeenCalled();
  });
});
