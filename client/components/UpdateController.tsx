import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, AppState } from "react-native";
import * as Updates from "expo-updates";
import * as Sentry from "@sentry/react-native";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/lib/query-client";
import { UpdateSheet } from "@/components/update/UpdateSheet";
import { useAppVersionCheck } from "@/hooks/useAppVersionCheck";

interface UpdateControllerProps {
  children: React.ReactNode;
}

// Module-scoped flag — guarantees the OTA check runs at most once per
// cold start, even if the React tree remounts the controller. Task #1306:
// kills the runaway re-check loop that contributed to the auto-reload mess.
let hasCheckedThisSession = false;

const KILL_SWITCH_TIMEOUT_MS = 1000;

function safeSentry(fn: () => void): void {
  try {
    fn();
  } catch {
    // Telemetry must NEVER crash the app — silent no-op fallback.
  }
}

// Known-transient OTA error codes from expo-updates that we routinely
// see on devices with patchy connectivity (Huawei without GMS, captive
// portals, brief CDN hiccups). They are NOT crashes — the app falls
// back to the embedded / last-loaded bundle and keeps running. Reporting
// them at error-level produces noisy per-device Sentry alerts; we
// downgrade to a single grouped warning instead.
//
// Note: ERR_UPDATES_RELOAD intentionally NOT included — a failed manual
// restart is a deliberate user action and rare enough to deserve full
// error-level visibility from the existing captureException in
// handleRestartNow.
const TRANSIENT_OTA_CODES = new Set([
  "ERR_UPDATES_CHECK",
  "ERR_UPDATES_FETCH",
]);

function reportOtaError(
  err: unknown,
  context: "check" | "fetch_retry",
): void {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const message = err instanceof Error ? err.message : String(err);
  const isTransient = TRANSIENT_OTA_CODES.has(code);

  safeSentry(() => {
    if (isTransient) {
      // Single grouped warning — one issue across all devices/sessions.
      Sentry.captureMessage(`ota_${context}_transient`, {
        level: "warning",
        fingerprint: ["ota-transient", context, code || "no_code"],
        tags: {
          ota_error_code: code || "unknown",
          ota_error_phase: context,
        },
        extra: {
          message,
          code,
        },
      });
    } else {
      // Truly unexpected — keep error-level + full stack capture.
      Sentry.captureException(err, {
        tags: {
          ota_error_code: code || "unknown",
          ota_error_phase: context,
        },
      });
    }
  });
}

/**
 * Server kill switch fetch. Fail-open by design: any error, timeout, or
 * non-OK response → returns `false` (OTA stays enabled). This way a
 * server outage cannot sabotage the OTA distribution channel.
 */
async function fetchKillSwitch(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), KILL_SWITCH_TIMEOUT_MS);
    let url: string;
    try {
      url = new URL("/api/ota-status", getApiUrl()).toString();
    } catch {
      clearTimeout(t);
      return false;
    }
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return false;
    const body = (await res.json()) as { disabled?: boolean };
    return body.disabled === true;
  } catch {
    return false;
  }
}

interface BootStatusPayload {
  platform: string;
  appVersion: string;
  runtimeVersion: string;
  channel: string;
  updateId: string;
  createdAt: string | null;
  isEmbeddedLaunch: boolean | null;
  isEmergencyLaunch: boolean | null;
  checkResult: string;
  fetchResult: string;
  reloadRequested: boolean;
  killSwitchActive: boolean;
  errorMessage?: string;
  errorCode?: string;
  source: CheckSource;
}

function captureBootStatus(payload: BootStatusPayload): void {
  safeSentry(() => {
    Sentry.setTag("ota_kill_switch_active", String(payload.killSwitchActive));
    Sentry.setTag("ota_check_result", payload.checkResult);
    Sentry.setTag("ota_fetch_result", payload.fetchResult);
    Sentry.setTag("ota_reload_requested", String(payload.reloadRequested));
    Sentry.setTag("ota_is_embedded_launch", String(payload.isEmbeddedLaunch));
    Sentry.setTag(
      "ota_is_emergency_launch",
      String(payload.isEmergencyLaunch),
    );
    Sentry.setTag("ota_created_at", payload.createdAt ?? "none");
    Sentry.setTag("ota_check_source", payload.source);
    if (payload.errorMessage) {
      Sentry.setTag("ota_error_message", payload.errorMessage.slice(0, 200));
    }
    if (payload.errorCode) {
      Sentry.setTag("ota_error_code", payload.errorCode);
    }
    Sentry.captureMessage("ota_boot_status", {
      level: "info",
      extra: payload as unknown as Record<string, unknown>,
    });
  });
}

function collectBaseTags(): Omit<
  BootStatusPayload,
  | "checkResult"
  | "fetchResult"
  | "reloadRequested"
  | "killSwitchActive"
  | "errorMessage"
  | "errorCode"
  | "source"
> {
  let appVersion = "unknown";
  let runtimeVersion = "unknown";
  let channel = "unknown";
  let updateId = "embedded";
  let createdAt: string | null = null;
  let isEmbeddedLaunch: boolean | null = null;
  let isEmergencyLaunch: boolean | null = null;
  try {
    // `nativeApplicationVersion` lives in `expo-application`, not
    // `expo-updates`. Guarded require so a missing module on web/dev
    // can never block the rest of the boot telemetry.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Application = require("expo-application");
      appVersion = String(
        Application?.nativeApplicationVersion ?? "unknown",
      );
    } catch {
      appVersion = "unknown";
    }
    runtimeVersion = String(Updates.runtimeVersion ?? "unknown");
    channel = String(Updates.channel ?? "unknown");
    updateId = String(Updates.updateId ?? "embedded");
    createdAt = Updates.createdAt
      ? new Date(Updates.createdAt as unknown as string | number | Date).toISOString()
      : null;
    isEmbeddedLaunch =
      typeof Updates.isEmbeddedLaunch === "boolean"
        ? Updates.isEmbeddedLaunch
        : null;
    isEmergencyLaunch =
      typeof Updates.isEmergencyLaunch === "boolean"
        ? Updates.isEmergencyLaunch
        : null;
  } catch {
    // Fall through with defaults — telemetry must never crash boot.
  }
  return {
    platform: Platform.OS,
    appVersion,
    runtimeVersion,
    channel,
    updateId,
    createdAt,
    isEmbeddedLaunch,
    isEmergencyLaunch,
  };
}

// `cold_start` = automatic check fired once per cold launch by the
// useEffect inside UpdateController. `manual` = on-demand check fired
// from a diagnostics button (Task #1373) — used so platform owners can
// verify a freshly published OTA without quitting and re-opening the
// app twice.
export type CheckSource = "cold_start" | "manual";

export type OtaCheckResult =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "kill_switch" }
  | { status: "disabled" }
  | { status: "no_update" }
  | { status: "update_ready" }
  | { status: "error"; code?: string; message?: string };

interface UpdateControllerContextValue {
  /**
   * Manually trigger an OTA check. Bypasses the cold-start
   * `hasCheckedThisSession` guard but is internally locked so concurrent
   * taps coalesce into one in-flight check. Resolves to the resulting
   * `OtaCheckResult` (or `{ status: "disabled" }` on web / when another
   * check is already running).
   */
  triggerCheckNow: () => Promise<OtaCheckResult>;
  /**
   * Most recent result of either a cold-start or manual check. Starts
   * as `{ status: "idle" }` until the first check resolves.
   */
  lastCheckResult: OtaCheckResult;
  /**
   * `true` while a check is in flight (cold-start or manual). UI can
   * use this to disable the trigger button.
   */
  isChecking: boolean;
}

const UpdateControllerContext =
  createContext<UpdateControllerContextValue | null>(null);

/**
 * Returns the controller context, or `null` when called outside the
 * `UpdateController` tree. Consumers (e.g. the platform-owner debug
 * button) MUST handle the null case so they degrade gracefully on old
 * binaries that don't ship this controller version.
 */
export function useUpdateController(): UpdateControllerContextValue | null {
  return useContext(UpdateControllerContext);
}

async function runOnceCheck(
  onUpdateReady: () => void,
  source: CheckSource,
): Promise<OtaCheckResult> {
  const baseTags = collectBaseTags();

  // Push the boot identity onto the Sentry scope before anything else, so
  // even if the OTA flow throws, downstream events have rich context.
  // Tag names match the App.tsx boot beacon (ota_runtime / ota_channel /
  // ota_update_id / ota_app_version) so dashboard queries don't need to
  // join across two parallel naming schemes.
  safeSentry(() => {
    Sentry.setTag("ota_platform", baseTags.platform);
    Sentry.setTag("ota_app_version", baseTags.appVersion);
    Sentry.setTag("ota_runtime", baseTags.runtimeVersion);
    Sentry.setTag("ota_channel", baseTags.channel);
    Sentry.setTag("ota_update_id", baseTags.updateId);
    Sentry.addBreadcrumb({
      category: "ota",
      level: "info",
      message: `[ota] ${source} check begin`,
      data: { ...baseTags, source } as unknown as Record<string, unknown>,
    });
  });

  let killSwitchActive = false;
  try {
    killSwitchActive = await fetchKillSwitch();
  } catch {
    killSwitchActive = false;
  }

  if (killSwitchActive) {
    captureBootStatus({
      ...baseTags,
      killSwitchActive: true,
      checkResult: "skipped_kill_switch",
      fetchResult: "none",
      reloadRequested: false,
      source,
    });
    return { status: "kill_switch" };
  }

  let checkResult = "none";
  let fetchResult = "none";
  let errorMessage: string | undefined;
  let errorCode: string | undefined;
  let outcome: OtaCheckResult = { status: "no_update" };

  try {
    if (!Updates.isEnabled) {
      checkResult = "disabled";
      outcome = { status: "disabled" };
    } else {
      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) {
        checkResult = "available";
        try {
          const fetched = await Updates.fetchUpdateAsync();
          if (fetched.isNew) {
            fetchResult = "new";
            outcome = { status: "update_ready" };
            onUpdateReady();
          } else {
            fetchResult = "no_new";
            outcome = { status: "no_update" };
          }
        } catch (fetchErr) {
          // ONE transparent retry — no escalation, no setInterval loop.
          safeSentry(() =>
            Sentry.addBreadcrumb({
              category: "ota",
              level: "warning",
              message: "[ota] fetch failed, attempting single retry",
              data: {
                error:
                  fetchErr instanceof Error
                    ? fetchErr.message
                    : String(fetchErr),
              },
            }),
          );
          try {
            const fetched2 = await Updates.fetchUpdateAsync();
            if (fetched2.isNew) {
              fetchResult = "new_after_retry";
              outcome = { status: "update_ready" };
              onUpdateReady();
            } else {
              fetchResult = "no_new_after_retry";
              outcome = { status: "no_update" };
            }
          } catch (fetchErr2) {
            fetchResult = "error";
            errorMessage =
              fetchErr2 instanceof Error
                ? fetchErr2.message
                : String(fetchErr2);
            errorCode = (fetchErr2 as { code?: string })?.code;
            outcome = {
              status: "error",
              code: errorCode,
              message: errorMessage,
            };
            reportOtaError(fetchErr2, "fetch_retry");
          }
        }
      } else {
        checkResult = "none";
        outcome = { status: "no_update" };
      }
    }
  } catch (err) {
    checkResult = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    errorCode = (err as { code?: string })?.code;
    outcome = { status: "error", code: errorCode, message: errorMessage };
    reportOtaError(err, "check");
  }

  captureBootStatus({
    ...baseTags,
    killSwitchActive: false,
    checkResult,
    fetchResult,
    reloadRequested: false,
    errorMessage,
    errorCode,
    source,
  });

  return outcome;
}

export function UpdateController({ children }: UpdateControllerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<OtaCheckResult>({
    status: "idle",
  });
  const [isChecking, setIsChecking] = useState(false);
  // Component-scoped in-flight coalescing. Distinct from the module-scoped
  // `hasCheckedThisSession` guard: that one prevents repeated COLD-START
  // checks across remounts; this one prevents two MANUAL checks (or a
  // manual + cold-start race) running concurrently inside the same
  // component instance. We hold the active promise itself (not just a
  // boolean) so concurrent callers all await the same resolution and
  // receive the real result, instead of a stale `lastCheckResult`
  // snapshot. Using a ref keeps the lock immune to React's batched
  // state updates.
  const inFlightPromiseRef = useRef<Promise<OtaCheckResult> | null>(null);
  const { t } = useTranslation();
  // Overlay-priority guard: if the install is below `minSupportedVersion`,
  // ForceUpdateGate is rendering its own blocking modal. We must NOT stack
  // the OTA "Update ready" sheet on top of it — that would let the user
  // tap "Restart now" to re-launch into the same broken version they're
  // already being told to update via the store. The hook is TanStack-Query
  // backed and shares its cache with ForceUpdateGate, so this adds no extra
  // network call. Network failures fail-open to "ok" inside the hook.
  //
  // Cold-start race: the version query starts as `isLoading: true` with a
  // default status of "ok", so a fast OTA check could otherwise flash the
  // OTA sheet before ForceUpdateGate's force modal mounts. We suppress
  // while the check is unresolved so force always wins on the very first
  // paint after cold launch.
  const { status: appVersionStatus, isLoading: appVersionLoading } =
    useAppVersionCheck();
  const suppressForForceGate =
    appVersionLoading || appVersionStatus === "force";

  const performCheck = useCallback(
    (source: CheckSource): Promise<OtaCheckResult> => {
      // Coalesce: if a check is already in flight (either cold-start or a
      // previous manual tap), return the SAME promise so every caller
      // resolves with the actual result. Returning a stale snapshot of
      // `lastCheckResult` would lie about checks that haven't finished yet.
      if (inFlightPromiseRef.current) {
        return inFlightPromiseRef.current;
      }
      setIsChecking(true);
      setLastCheckResult({ status: "checking" });
      const p = (async (): Promise<OtaCheckResult> => {
        try {
          const result = await runOnceCheck(
            () => setShowBanner(true),
            source,
          );
          setLastCheckResult(result);
          return result;
        } finally {
          inFlightPromiseRef.current = null;
          setIsChecking(false);
        }
      })();
      inFlightPromiseRef.current = p;
      return p;
    },
    // No reactive deps: performCheck reads only refs and state setters
    // (which are stable). Keeping the identity fixed lets the Provider
    // value be memoized cheaply and avoids re-rendering every consumer
    // when `lastCheckResult` updates.
    [],
  );

  const triggerCheckNow = useCallback(async (): Promise<OtaCheckResult> => {
    if (Platform.OS === "web") {
      const r: OtaCheckResult = { status: "disabled" };
      setLastCheckResult(r);
      return r;
    }
    return performCheck("manual");
  }, [performCheck]);

  useEffect(() => {
    if (__DEV__ || Platform.OS === "web") return;
    if (hasCheckedThisSession) return;

    // AppState guard — only run when the app is actually foreground active.
    // If for some reason the controller mounts during a background launch
    // (rare, but possible with notification-launch flows), defer to the
    // next foreground transition without scheduling repeat checks.
    if (AppState.currentState !== "active") {
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active" && !hasCheckedThisSession) {
          hasCheckedThisSession = true;
          sub.remove();
          void performCheck("cold_start");
        }
      });
      return () => sub.remove();
    }

    hasCheckedThisSession = true;
    void performCheck("cold_start");
    // performCheck only depends on lastCheckResult, but we intentionally
    // run this effect ONCE on mount (the module-scoped guard ensures it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestartNow = async () => {
    if (isReloading) return;
    setIsReloading(true);
    safeSentry(() => {
      Sentry.addBreadcrumb({
        category: "ota",
        level: "info",
        message: "[ota] user tapped Restart Now",
      });
      Sentry.captureMessage("ota_reload_requested", {
        level: "info",
        extra: { reloadRequested: true },
      });
      Sentry.setTag("ota_reload_requested", "true");
    });
    try {
      await Updates.reloadAsync();
    } catch (err) {
      safeSentry(() => Sentry.captureException(err));
      setIsReloading(false);
      // Sheet stays so the user can try again, or dismiss.
    }
  };

  const handleLater = () => {
    safeSentry(() =>
      Sentry.addBreadcrumb({
        category: "ota",
        level: "info",
        message: "[ota] user dismissed update banner (Later)",
      }),
    );
    setShowBanner(false);
  };

  const primaryLabel = isReloading
    ? t("appUpdate.ota.restarting", { defaultValue: "Restarting…" })
    : t("appUpdate.ota.restartNow", { defaultValue: "Restart now" });

  // Memoize the provider value so consumers (like the Platform Center
  // debug button) don't re-render on every UpdateController re-render
  // caused by unrelated local state (banner toggle, restart pending).
  // `triggerCheckNow` is already a stable callback (see useCallback above
  // with empty deps), so the only inputs that should mutate the context
  // identity are the actual check state.
  const contextValue = useMemo<UpdateControllerContextValue>(
    () => ({ triggerCheckNow, lastCheckResult, isChecking }),
    [triggerCheckNow, lastCheckResult, isChecking],
  );

  return (
    <UpdateControllerContext.Provider value={contextValue}>
      {children}
      {showBanner && !suppressForForceGate ? (
        <UpdateSheet
          iconName="download-cloud"
          title={t("appUpdate.ota.title", { defaultValue: "Update ready" })}
          subtitle={t("appUpdate.ota.subtitle", {
            defaultValue:
              "A new version is ready. Restart now or apply automatically next time you open the app.",
          })}
          primaryLabel={primaryLabel}
          onPrimary={handleRestartNow}
          primaryDisabled={isReloading}
          secondaryLabel={t("appUpdate.ota.later", { defaultValue: "Later" })}
          onSecondary={handleLater}
        />
      ) : null}
    </UpdateControllerContext.Provider>
  );
}
