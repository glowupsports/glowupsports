import React, { createContext, useContext } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useMutation, useQuery } from "@tanstack/react-query";
// Types are import-only (no runtime) — safe to use on web
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from "react-native-purchases";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const isNative = Platform.OS !== "web";

// react-native-purchases is a native-only SDK — crashes on web.
// Load it conditionally so the web bundle remains functional.
let Purchases: typeof import("react-native-purchases").default | null = null;
if (isNative) {
  try {
    Purchases = require("react-native-purchases").default;
  } catch {
    // SDK unavailable (e.g. Expo Go without native build)
  }
}

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "ai_pro";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

function getRevenueCatApiKey(): string {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat API keys not configured");
  }
  if (__DEV__ || !isNative || isExpoGo) return REVENUECAT_TEST_API_KEY;
  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

export function initializeRevenueCat() {
  if (!Purchases) return;
  const apiKey = getRevenueCatApiKey();
  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  console.log("[RevenueCat] Configured");
}

export async function loginRevenueCat(userId: string) {
  if (!Purchases) return;
  try {
    await Purchases.logIn(userId);
  } catch {
    console.warn("[RevenueCat] logIn failed for user:", userId);
  }
}

export async function logoutRevenueCat() {
  if (!Purchases) return;
  try {
    await Purchases.logOut();
  } catch {
    console.warn("[RevenueCat] logOut failed");
  }
}

function useSubscriptionContext() {
  const customerInfoQuery = useQuery<CustomerInfo | null>({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: () => (Purchases ? Purchases.getCustomerInfo() : Promise.resolve(null)),
    staleTime: 60 * 1000,
    enabled: !!Purchases,
  });

  const offeringsQuery = useQuery<PurchasesOfferings | null>({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => (Purchases ? Purchases.getOfferings() : Promise.resolve(null)),
    staleTime: 300 * 1000,
    enabled: !!Purchases,
  });

  const purchaseMutation = useMutation<CustomerInfo | null, Error, PurchasesPackage>({
    mutationFn: async (pkg) => {
      if (!Purchases) return null;
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation<CustomerInfo | null, Error, void>({
    mutationFn: async () => {
      if (!Purchases) return null;
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
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    purchaseError: purchaseMutation.error,
    refetchCustomerInfo: customerInfoQuery.refetch,
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
