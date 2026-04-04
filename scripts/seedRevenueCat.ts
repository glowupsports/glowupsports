import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "Glowup Sports";

const MONTHLY_PRODUCT_IDENTIFIER = "com.glowupsports.app.aipro.monthly";
const YEARLY_PRODUCT_IDENTIFIER = "com.glowupsports.app.aipro.yearly";
const PLAY_STORE_MONTHLY_IDENTIFIER = "com.glowupsports.app.aipro.monthly:monthly";
const PLAY_STORE_YEARLY_IDENTIFIER = "com.glowupsports.app.aipro.yearly:yearly";

const APP_STORE_APP_NAME = "Glowup Sports iOS";
const APP_STORE_BUNDLE_ID = "com.glowupsports.app";
const PLAY_STORE_APP_NAME = "Glowup Sports Android";
const PLAY_STORE_PACKAGE_NAME = "com.glowupsports.app";

const ENTITLEMENT_IDENTIFIER = "ai_pro";
const ENTITLEMENT_DISPLAY_NAME = "AI Pro Access";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });

  if (listProjectsError) throw new Error("Failed to list projects");

  const existingProject = existingProjects.items?.find((p) => p.name === PROJECT_NAME);

  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data: newProject, error: createProjectError } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (createProjectError) throw new Error("Failed to create project");
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listAppsError || !apps || apps.items.length === 0) {
    throw new Error("No apps found");
  }

  let testStoreApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");
  let playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");

  if (!testStoreApp) throw new Error("No app with test store found");
  console.log("Test Store app found:", testStoreApp.id);

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: APP_STORE_APP_NAME,
        type: "app_store",
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app found:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: PLAY_STORE_APP_NAME,
        type: "play_store",
        play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
      },
    });
    if (error) throw new Error("Failed to create Play Store app");
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app found:", playStoreApp.id);
  }

  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });

  if (listProductsError) throw new Error("Failed to list products");

  const ensureProduct = async (
    targetApp: App,
    label: string,
    storeIdentifier: string,
    displayName: string,
    duration: "P1M" | "P1Y",
    isTestStore: boolean
  ): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === storeIdentifier && p.app_id === targetApp.id
    );
    if (existing) {
      console.log(`${label} product already exists:`, existing.id);
      return existing;
    }
    const body: CreateProductData["body"] = {
      store_identifier: storeIdentifier,
      app_id: targetApp.id,
      type: "subscription",
      display_name: displayName,
    };
    if (isTestStore) {
      body.subscription = { duration };
      body.title = displayName;
    }
    const { data: created, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });
    if (error) throw new Error(`Failed to create ${label} product`);
    console.log(`Created ${label} product:`, created.id);
    return created;
  };

  const testMonthly = await ensureProduct(testStoreApp, "Test Monthly", MONTHLY_PRODUCT_IDENTIFIER, "AI Pro Monthly", "P1M", true);
  const testYearly = await ensureProduct(testStoreApp, "Test Yearly", YEARLY_PRODUCT_IDENTIFIER, "AI Pro Yearly", "P1Y", true);
  const appStoreMonthly = await ensureProduct(appStoreApp, "AppStore Monthly", MONTHLY_PRODUCT_IDENTIFIER, "AI Pro Monthly", "P1M", false);
  const appStoreYearly = await ensureProduct(appStoreApp, "AppStore Yearly", YEARLY_PRODUCT_IDENTIFIER, "AI Pro Yearly", "P1Y", false);
  const playStoreMonthly = await ensureProduct(playStoreApp, "PlayStore Monthly", PLAY_STORE_MONTHLY_IDENTIFIER, "AI Pro Monthly", "P1M", false);
  const playStoreYearly = await ensureProduct(playStoreApp, "PlayStore Yearly", PLAY_STORE_YEARLY_IDENTIFIER, "AI Pro Yearly", "P1Y", false);

  const addTestPrices = async (productId: string, label: string, monthlyMicros: number, yearlyMicros: number, isYearly: boolean) => {
    const prices = isYearly
      ? [{ amount_micros: yearlyMicros, currency: "USD" }, { amount_micros: Math.round(yearlyMicros * 0.9), currency: "EUR" }]
      : [{ amount_micros: monthlyMicros, currency: "USD" }, { amount_micros: Math.round(monthlyMicros * 0.9), currency: "EUR" }];

    const { error } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: productId },
      body: { prices },
    });
    if (error) {
      if (typeof error === "object" && "type" in error && (error as any)["type"] === "resource_already_exists") {
        console.log(`${label} test prices already exist`);
      } else {
        throw new Error(`Failed to add ${label} test store prices`);
      }
    } else {
      console.log(`Added ${label} test store prices`);
    }
  };

  await addTestPrices(testMonthly.id, "Monthly", 9990000, 79990000, false);
  await addTestPrices(testYearly.id, "Yearly", 9990000, 79990000, true);

  let entitlement: Entitlement;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const existingEntitlement = existingEntitlements.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);
  if (existingEntitlement) {
    console.log("Entitlement already exists:", existingEntitlement.id);
    entitlement = existingEntitlement;
  } else {
    const { data: newEntitlement, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement");
    console.log("Created entitlement:", newEntitlement.id);
    entitlement = newEntitlement;
  }

  const allProductIds = [testMonthly.id, testYearly.id, appStoreMonthly.id, appStoreYearly.id, playStoreMonthly.id, playStoreYearly.id];
  const { error: attachEntitlementError } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: allProductIds },
  });
  if (attachEntitlementError) {
    if ((attachEntitlementError as any).type === "unprocessable_entity_error") {
      console.log("Products already attached to entitlement");
    } else {
      throw new Error("Failed to attach products to entitlement");
    }
  } else {
    console.log("Attached all products to entitlement");
  }

  let offering: Offering;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOffering = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);
  if (existingOffering) {
    console.log("Offering already exists:", existingOffering.id);
    offering = existingOffering;
  } else {
    const { data: newOffering, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", newOffering.id);
    offering = newOffering;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listPackagesError) throw new Error("Failed to list packages");

  const ensurePackage = async (lookupKey: string, displayName: string): Promise<Package> => {
    const existing = existingPackages.items?.find((p) => p.lookup_key === lookupKey);
    if (existing) {
      console.log(`Package ${lookupKey} already exists:`, existing.id);
      return existing;
    }
    const { data: newPkg, error } = await createPackages({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { lookup_key: lookupKey, display_name: displayName },
    });
    if (error) throw new Error(`Failed to create package ${lookupKey}`);
    console.log(`Created package ${lookupKey}:`, newPkg.id);
    return newPkg;
  };

  const monthlyPkg = await ensurePackage("$rc_monthly", "AI Pro Monthly");
  const yearlyPkg = await ensurePackage("$rc_annual", "AI Pro Yearly");

  const attachPkg = async (pkg: Package, products: Product[]) => {
    const { error } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: products.map((p) => ({ product_id: p.id, eligibility_criteria: "all" as const })),
      },
    });
    if (error) {
      if ((error as any).type === "unprocessable_entity_error") {
        console.log(`Package ${pkg.lookup_key} products already attached`);
      } else {
        throw new Error(`Failed to attach products to package ${pkg.lookup_key}`);
      }
    } else {
      console.log(`Attached products to package ${pkg.lookup_key}`);
    }
  };

  await attachPkg(monthlyPkg, [testMonthly, appStoreMonthly, playStoreMonthly]);
  await attachPkg(yearlyPkg, [testYearly, appStoreYearly, playStoreYearly]);

  const { data: testApiKeys } = await listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: testStoreApp.id } });
  const { data: appStoreApiKeys } = await listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: appStoreApp.id } });
  const { data: playStoreApiKeys } = await listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: playStoreApp.id } });

  console.log("\n====================");
  console.log("RevenueCat setup complete!");
  console.log("Project ID:", project.id);
  console.log("Test Store App ID:", testStoreApp.id);
  console.log("App Store App ID:", appStoreApp.id);
  console.log("Play Store App ID:", playStoreApp.id);
  console.log("Entitlement Identifier:", ENTITLEMENT_IDENTIFIER);
  console.log("Public API Keys - Test Store:", testApiKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("Public API Keys - App Store:", appStoreApiKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("Public API Keys - Play Store:", playStoreApiKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("====================\n");
  console.log("Set these environment variables:");
  console.log("REVENUECAT_PROJECT_ID=" + project.id);
  console.log("REVENUECAT_TEST_STORE_APP_ID=" + testStoreApp.id);
  console.log("REVENUECAT_APPLE_APP_STORE_APP_ID=" + appStoreApp.id);
  console.log("REVENUECAT_GOOGLE_PLAY_STORE_APP_ID=" + playStoreApp.id);
  console.log("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY=" + (testApiKeys?.items[0]?.key ?? "N/A"));
  console.log("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=" + (appStoreApiKeys?.items[0]?.key ?? "N/A"));
  console.log("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=" + (playStoreApiKeys?.items[0]?.key ?? "N/A"));
}

seedRevenueCat().catch(console.error);
