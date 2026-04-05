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
    retry: 2,
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
