import React, { createContext, useContext } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from "react-native-purchases";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Purchases: typeof import("react-native-purchases").default | null = null;
try {
  Purchases = require("react-native-purchases").default;
} catch {
  // SDK unavailable
}

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "ai_pro";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

function getRevenueCatApiKey(): string {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat API keys not configured");
  }
  if (isExpoGo || __DEV__) return REVENUECAT_TEST_API_KEY;
  if (REVENUECAT_IOS_API_KEY && Constants.platform?.ios) return REVENUECAT_IOS_API_KEY;
  if (REVENUECAT_ANDROID_API_KEY && Constants.platform?.android) return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

// Task #1379 — Configured-gate for the lazy initializeRevenueCat() flow in
// App.tsx (deferred to a useEffect so it runs AFTER first paint instead of
// blocking ~150-300ms of bridge time on cold start). Because configure()
// no longer happens at module-eval time, the queries below — and any caller
// of loginRevenueCat() from AuthContext — could race in and call native
// RNPurchases methods on an unconfigured instance, which throws on iOS.
//
// Two distinct flags (architect-flagged in 2nd review):
//   initAttempted  — set true after init runs, success OR failure. Resolves
//                    the promise so awaiters never deadlock.
//   isConfigured   — set true ONLY after a successful Purchases.configure().
//                    Native call sites short-circuit to null/no-op when
//                    this is false, so a thrown apiKey or configure error
//                    never reaches a native bridge call.
//
// Idempotency: initializeRevenueCat() returns early if already attempted,
// so HMR remounts / accidental double-mount of the SubscriptionProvider
// don't re-run Purchases.configure().
let configuredResolve: (() => void) | null = null;
let configuredPromise: Promise<void> = new Promise((resolve) => {
  configuredResolve = resolve;
});
let initAttempted = false;
let isConfigured = false;

function markInitAttempted() {
  if (!initAttempted) {
    initAttempted = true;
    configuredResolve?.();
  }
}

export function isRevenueCatConfigured(): boolean {
  return isConfigured;
}

export function whenRevenueCatConfigured(): Promise<void> {
  return configuredPromise;
}

export function initializeRevenueCat() {
  if (initAttempted) return; // idempotent — guards HMR / double-mount
  if (!Purchases) {
    // No native SDK (web / dev fallback). Mark attempted so awaiters
    // resolve and short-circuit through the !isConfigured path.
    markInitAttempted();
    return;
  }
  try {
    const apiKey = getRevenueCatApiKey();
    Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey });
    isConfigured = true; // ONLY on successful configure
    console.log("[RevenueCat] Configured");
  } catch (err) {
    // isConfigured stays false — call sites will return null instead of
    // hitting an unconfigured native bridge.
    console.warn("[RevenueCat] init failed:", err);
  } finally {
    markInitAttempted();
  }
}

export async function loginRevenueCat(userId: string) {
  if (!Purchases) return;
  await configuredPromise;
  if (!isConfigured) return;
  try {
    await Purchases.logIn(userId);
  } catch {
    console.warn("[RevenueCat] logIn failed for user:", userId);
  }
}

export async function logoutRevenueCat() {
  if (!Purchases) return;
  await configuredPromise;
  if (!isConfigured) return;
  try {
    await Purchases.logOut();
  } catch {
    console.warn("[RevenueCat] logOut failed");
  }
}

function useSubscriptionContext() {
  // Task #1379 — every native call below awaits configuredPromise. This
  // is what makes the deferred initializeRevenueCat() in App.tsx safe:
  // if SubscriptionProvider mounts before the deferral fires, queries
  // suspend on the promise instead of throwing on an unconfigured
  // Purchases instance. After configure resolves (success OR failure),
  // each call also rechecks isRevenueCatConfigured() so a failed init
  // returns null instead of crashing.
  const customerInfoQuery = useQuery<CustomerInfo | null>({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: async () => {
      if (!Purchases) return null;
      await configuredPromise;
      if (!isConfigured) return null;
      return Purchases.getCustomerInfo();
    },
    staleTime: 60 * 1000,
    enabled: !!Purchases,
  });

  const offeringsQuery = useQuery<PurchasesOfferings | null>({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      if (!Purchases) return null;
      await configuredPromise;
      if (!isConfigured) return null;
      return Purchases.getOfferings();
    },
    staleTime: 300 * 1000,
    enabled: !!Purchases,
    retry: 2,
  });

  const purchaseMutation = useMutation<CustomerInfo | null, Error, PurchasesPackage>({
    mutationFn: async (pkg) => {
      if (!Purchases) return null;
      await configuredPromise;
      if (!isConfigured) return null;
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation<CustomerInfo | null, Error, void>({
    mutationFn: async () => {
      if (!Purchases) return null;
      await configuredPromise;
      if (!isConfigured) return null;
      return Purchases.restorePurchases();
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const isSubscribed =
    customerInfoQuery.data?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  return {
    customerInfo: customerInfoQuery.data ?? null,
    offerings: offeringsQuery.data ?? null,
    isSubscribed,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    isOfferingsLoading: offeringsQuery.isLoading,
    isOfferingsError: offeringsQuery.isError,
    refetchOfferings: offeringsQuery.refetch,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    purchaseError: purchaseMutation.error,
    refetchCustomerInfo: customerInfoQuery.refetch,
    isPurchaseAvailable: Purchases !== null,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}
