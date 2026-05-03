import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  listApps,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
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

// ── Arena Pass (subscription) ─────────────────────────────────────────────────
const ARENA_PASS_MONTHLY_ID = "com.glowupsports.app.arena.pass.monthly";
const ARENA_PASS_MONTHLY_PLAY = "com.glowupsports.app.arena.pass.monthly:monthly";

// ── Coin Bundles (one-time consumable) ────────────────────────────────────────
const COIN_200_ID  = "com.glowupsports.app.coins.200";
const COIN_550_ID  = "com.glowupsports.app.coins.550";
const COIN_1200_ID = "com.glowupsports.app.coins.1200";
const COIN_2800_ID = "com.glowupsports.app.coins.2800";

// ── Pack IAPs (one-time) ──────────────────────────────────────────────────────
const PACK_BRONZE_ID               = "com.glowupsports.app.pack.bronze";
const PACK_SILVER_ID               = "com.glowupsports.app.pack.silver";
const PACK_GOLD_ID                 = "com.glowupsports.app.pack.gold";
const PACK_MEGA_ID                 = "com.glowupsports.app.pack.mega";
const PACK_GUARANTEED_LEGENDARY_ID = "com.glowupsports.app.pack.guaranteed_legendary";

// ── Cosmetics (one-time) ──────────────────────────────────────────────────────
const COSMETIC_HOLOGRAPHIC_ID = "com.glowupsports.app.cosmetic.holographic";
const COSMETIC_NEON_ID        = "com.glowupsports.app.cosmetic.neon";
const COSMETIC_MANGA_ID       = "com.glowupsports.app.cosmetic.manga";
const COSMETIC_CARD_BACK_ID   = "com.glowupsports.app.cosmetic.card_back";

const ARENA_PASS_ENTITLEMENT     = "arena_pass";
const ARENA_PASS_ENTITLEMENT_NAME = "Arena Pass";

const ARENA_OFFERING_KEY  = "arena";
const ARENA_OFFERING_NAME = "Arena Offering";

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedArenaRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  // ── Resolve project ──────────────────────────────────────────────────────────
  const { data: projectsData, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError) throw new Error("Failed to list projects");

  const project: Project | undefined = projectsData.items?.find((p) => p.name === PROJECT_NAME);
  if (!project) throw new Error(`Project "${PROJECT_NAME}" not found — run seedRevenueCat.ts first`);
  console.log("Project found:", project.id);

  // ── Resolve apps ─────────────────────────────────────────────────────────────
  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps || apps.items.length === 0) throw new Error("No apps found");

  const testStoreApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  const appStoreApp:  App | undefined = apps.items.find((a) => a.type === "app_store");
  const playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");

  if (!testStoreApp) throw new Error("No test store app found");
  if (!appStoreApp)  throw new Error("No App Store app found — run seedRevenueCat.ts first");
  if (!playStoreApp) throw new Error("No Play Store app found — run seedRevenueCat.ts first");

  console.log("Apps resolved:", testStoreApp.id, appStoreApp.id, playStoreApp.id);

  // ── Fetch existing products once ─────────────────────────────────────────────
  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 200 },
  });
  if (listProductsError) throw new Error("Failed to list products");

  // ── Helper: ensure non-subscription (consumable / non-consumable) product ────
  const ensureConsumable = async (
    targetApp: App,
    label: string,
    storeIdentifier: string,
    displayName: string,
    isTestStore: boolean,
  ): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === storeIdentifier && p.app_id === targetApp.id,
    );
    if (existing) {
      console.log(`${label} product already exists:`, existing.id);
      return existing;
    }
    const body: CreateProductData["body"] = {
      store_identifier: storeIdentifier,
      app_id: targetApp.id,
      type: "one_time",
      display_name: displayName,
    };
    if (isTestStore) body.title = displayName;
    const { data: created, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });
    if (error) throw new Error(`Failed to create ${label} product: ${JSON.stringify(error)}`);
    console.log(`Created ${label} product:`, created.id);
    return created;
  };

  // ── Helper: ensure subscription product ──────────────────────────────────────
  const ensureSubscription = async (
    targetApp: App,
    label: string,
    storeIdentifier: string,
    displayName: string,
    isTestStore: boolean,
  ): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === storeIdentifier && p.app_id === targetApp.id,
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
      body.subscription = { duration: "P1M" };
      body.title = displayName;
    }
    const { data: created, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });
    if (error) throw new Error(`Failed to create ${label} subscription: ${JSON.stringify(error)}`);
    console.log(`Created ${label} subscription:`, created.id);
    return created;
  };

  // ── Helper: add test store prices ────────────────────────────────────────────
  const addTestPrice = async (productId: string, label: string, amountMicros: number) => {
    const { error } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: productId },
      body: { prices: [{ amount_micros: amountMicros, currency: "USD" }] },
    });
    if (error) {
      if (typeof error === "object" && error !== null && "type" in error && (error as Record<string, unknown>)["type"] === "resource_already_exists") {
        console.log(`${label} test prices already exist`);
      } else {
        console.warn(`Failed to add ${label} test store prices (may already exist):`, JSON.stringify(error));
      }
    } else {
      console.log(`Added ${label} test store prices`);
    }
  };

  // ── Arena Pass ───────────────────────────────────────────────────────────────
  const testArenaPass  = await ensureSubscription(testStoreApp, "Test Arena Pass Monthly",  ARENA_PASS_MONTHLY_ID,   "Arena Pass Monthly", true);
  const iosArenaPass   = await ensureSubscription(appStoreApp,  "iOS Arena Pass Monthly",   ARENA_PASS_MONTHLY_ID,   "Arena Pass Monthly", false);
  const playArenaPass  = await ensureSubscription(playStoreApp, "Play Arena Pass Monthly",  ARENA_PASS_MONTHLY_PLAY, "Arena Pass Monthly", false);
  await addTestPrice(testArenaPass.id, "Arena Pass Monthly", 3_990_000); // €3.99/mo

  // ── Coin Bundles ─────────────────────────────────────────────────────────────
  const test200  = await ensureConsumable(testStoreApp, "Test 200 Coins",  COIN_200_ID,  "200 Coins",   true);
  const ios200   = await ensureConsumable(appStoreApp,  "iOS 200 Coins",   COIN_200_ID,  "200 Coins",   false);
  const play200  = await ensureConsumable(playStoreApp, "Play 200 Coins",  COIN_200_ID,  "200 Coins",   false);
  await addTestPrice(test200.id, "200 Coins", 990_000); // €0.99

  const test550  = await ensureConsumable(testStoreApp, "Test 550 Coins",  COIN_550_ID,  "550 Coins",   true);
  const ios550   = await ensureConsumable(appStoreApp,  "iOS 550 Coins",   COIN_550_ID,  "550 Coins",   false);
  const play550  = await ensureConsumable(playStoreApp, "Play 550 Coins",  COIN_550_ID,  "550 Coins",   false);
  await addTestPrice(test550.id, "550 Coins", 2_490_000); // €2.49

  const test1200 = await ensureConsumable(testStoreApp, "Test 1200 Coins", COIN_1200_ID, "1200 Coins",  true);
  const ios1200  = await ensureConsumable(appStoreApp,  "iOS 1200 Coins",  COIN_1200_ID, "1200 Coins",  false);
  const play1200 = await ensureConsumable(playStoreApp, "Play 1200 Coins", COIN_1200_ID, "1200 Coins",  false);
  await addTestPrice(test1200.id, "1200 Coins", 6_990_000); // €6.99

  const test2800 = await ensureConsumable(testStoreApp, "Test 2800 Coins", COIN_2800_ID, "2800 Coins",  true);
  const ios2800  = await ensureConsumable(appStoreApp,  "iOS 2800 Coins",  COIN_2800_ID, "2800 Coins",  false);
  const play2800 = await ensureConsumable(playStoreApp, "Play 2800 Coins", COIN_2800_ID, "2800 Coins",  false);
  await addTestPrice(test2800.id, "2800 Coins", 17_990_000); // €17.99

  // ── Pack IAPs ────────────────────────────────────────────────────────────────
  const testBronzePack = await ensureConsumable(testStoreApp, "Test Bronze Pack", PACK_BRONZE_ID, "Bronze Pack", true);
  const iosBronzePack  = await ensureConsumable(appStoreApp,  "iOS Bronze Pack",  PACK_BRONZE_ID, "Bronze Pack", false);
  const playBronzePack = await ensureConsumable(playStoreApp, "Play Bronze Pack", PACK_BRONZE_ID, "Bronze Pack", false);
  await addTestPrice(testBronzePack.id, "Bronze Pack", 990_000); // €0.99

  const testSilverPack = await ensureConsumable(testStoreApp, "Test Silver Pack", PACK_SILVER_ID, "Silver Pack", true);
  const iosSilverPack  = await ensureConsumable(appStoreApp,  "iOS Silver Pack",  PACK_SILVER_ID, "Silver Pack", false);
  const playSilverPack = await ensureConsumable(playStoreApp, "Play Silver Pack", PACK_SILVER_ID, "Silver Pack", false);
  await addTestPrice(testSilverPack.id, "Silver Pack", 2_490_000); // €2.49

  const testGoldPack = await ensureConsumable(testStoreApp, "Test Gold Pack", PACK_GOLD_ID, "Gold Pack", true);
  const iosGoldPack  = await ensureConsumable(appStoreApp,  "iOS Gold Pack",  PACK_GOLD_ID, "Gold Pack", false);
  const playGoldPack = await ensureConsumable(playStoreApp, "Play Gold Pack", PACK_GOLD_ID, "Gold Pack", false);
  await addTestPrice(testGoldPack.id, "Gold Pack", 4_990_000); // €4.99

  const testMegaPack = await ensureConsumable(testStoreApp, "Test Mega Pack", PACK_MEGA_ID, "Mega Bundle", true);
  const iosMegaPack  = await ensureConsumable(appStoreApp,  "iOS Mega Pack",  PACK_MEGA_ID, "Mega Bundle", false);
  const playMegaPack = await ensureConsumable(playStoreApp, "Play Mega Pack", PACK_MEGA_ID, "Mega Bundle", false);
  await addTestPrice(testMegaPack.id, "Mega Bundle", 19_990_000); // €19.99

  const testGuaranteedLegendary = await ensureConsumable(testStoreApp, "Test Guaranteed Legendary", PACK_GUARANTEED_LEGENDARY_ID, "Guaranteed Legendary", true);
  const iosGuaranteedLegendary  = await ensureConsumable(appStoreApp,  "iOS Guaranteed Legendary",  PACK_GUARANTEED_LEGENDARY_ID, "Guaranteed Legendary", false);
  const playGuaranteedLegendary = await ensureConsumable(playStoreApp, "Play Guaranteed Legendary", PACK_GUARANTEED_LEGENDARY_ID, "Guaranteed Legendary", false);
  await addTestPrice(testGuaranteedLegendary.id, "Guaranteed Legendary", 7_990_000); // €7.99

  // ── Cosmetics ────────────────────────────────────────────────────────────────
  const testHolographic = await ensureConsumable(testStoreApp, "Test Holographic Frame", COSMETIC_HOLOGRAPHIC_ID, "Holographic Frame", true);
  const iosHolographic  = await ensureConsumable(appStoreApp,  "iOS Holographic Frame",  COSMETIC_HOLOGRAPHIC_ID, "Holographic Frame", false);
  const playHolographic = await ensureConsumable(playStoreApp, "Play Holographic Frame", COSMETIC_HOLOGRAPHIC_ID, "Holographic Frame", false);
  await addTestPrice(testHolographic.id, "Holographic Frame", 3_990_000); // €3.99

  const testNeon = await ensureConsumable(testStoreApp, "Test Neon Glow", COSMETIC_NEON_ID, "Neon Glow", true);
  const iosNeon  = await ensureConsumable(appStoreApp,  "iOS Neon Glow",  COSMETIC_NEON_ID, "Neon Glow", false);
  const playNeon = await ensureConsumable(playStoreApp, "Play Neon Glow", COSMETIC_NEON_ID, "Neon Glow", false);
  await addTestPrice(testNeon.id, "Neon Glow", 1_990_000); // €1.99

  const testManga = await ensureConsumable(testStoreApp, "Test Manga Style", COSMETIC_MANGA_ID, "Manga Style", true);
  const iosManga  = await ensureConsumable(appStoreApp,  "iOS Manga Style",  COSMETIC_MANGA_ID, "Manga Style", false);
  const playManga = await ensureConsumable(playStoreApp, "Play Manga Style", COSMETIC_MANGA_ID, "Manga Style", false);
  await addTestPrice(testManga.id, "Manga Style", 1_990_000); // €1.99

  const testCardBack = await ensureConsumable(testStoreApp, "Test Exclusive Card Back", COSMETIC_CARD_BACK_ID, "Exclusive Card Back", true);
  const iosCardBack  = await ensureConsumable(appStoreApp,  "iOS Exclusive Card Back",  COSMETIC_CARD_BACK_ID, "Exclusive Card Back", false);
  const playCardBack = await ensureConsumable(playStoreApp, "Play Exclusive Card Back", COSMETIC_CARD_BACK_ID, "Exclusive Card Back", false);
  await addTestPrice(testCardBack.id, "Exclusive Card Back", 990_000); // €0.99

  // ── Arena Pass Entitlement ───────────────────────────────────────────────────
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  let arenaPassEntitlement: Entitlement;
  const existingArenaEntitlement = existingEntitlements.items?.find(
    (e) => e.lookup_key === ARENA_PASS_ENTITLEMENT,
  );
  if (existingArenaEntitlement) {
    console.log("Arena Pass entitlement already exists:", existingArenaEntitlement.id);
    arenaPassEntitlement = existingArenaEntitlement;
  } else {
    const { data: newEntitlement, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ARENA_PASS_ENTITLEMENT, display_name: ARENA_PASS_ENTITLEMENT_NAME },
    });
    if (error) throw new Error("Failed to create arena_pass entitlement");
    console.log("Created Arena Pass entitlement:", newEntitlement.id);
    arenaPassEntitlement = newEntitlement;
  }

  // Attach Arena Pass subscription products to the entitlement
  const { error: attachArenaEntErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: arenaPassEntitlement.id },
    body: { product_ids: [testArenaPass.id, iosArenaPass.id, playArenaPass.id] },
  });
  if (attachArenaEntErr) {
    if (typeof attachArenaEntErr === "object" && attachArenaEntErr !== null && (attachArenaEntErr as Record<string, unknown>).type === "unprocessable_entity_error") {
      console.log("Arena Pass products already attached to entitlement");
    } else {
      console.warn("Failed to attach Arena Pass products to entitlement:", JSON.stringify(attachArenaEntErr));
    }
  } else {
    console.log("Attached Arena Pass products to entitlement");
  }

  // ── Arena Offering ───────────────────────────────────────────────────────────
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");

  let arenaOffering: Offering;
  const existingArenaOffering = existingOfferings.items?.find((o) => o.lookup_key === ARENA_OFFERING_KEY);
  if (existingArenaOffering) {
    console.log("Arena offering already exists:", existingArenaOffering.id);
    arenaOffering = existingArenaOffering;
  } else {
    const { data: newOffering, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ARENA_OFFERING_KEY, display_name: ARENA_OFFERING_NAME },
    });
    if (error) throw new Error("Failed to create arena offering");
    console.log("Created arena offering:", newOffering.id);
    arenaOffering = newOffering;
  }

  // ── Arena Packages ───────────────────────────────────────────────────────────
  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: arenaOffering.id },
    query: { limit: 50 },
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
      path: { project_id: project.id, offering_id: arenaOffering.id },
      body: { lookup_key: lookupKey, display_name: displayName },
    });
    if (error) throw new Error(`Failed to create package ${lookupKey}`);
    console.log(`Created package ${lookupKey}:`, newPkg.id);
    return newPkg;
  };

  const attachPkg = async (pkg: Package, products: Product[]) => {
    const { error } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: products.map((p) => ({ product_id: p.id, eligibility_criteria: "all" as const })),
      },
    });
    if (error) {
      if (typeof error === "object" && error !== null && (error as Record<string, unknown>).type === "unprocessable_entity_error") {
        console.log(`Package ${pkg.lookup_key} products already attached`);
      } else {
        console.warn(`Failed to attach products to package ${pkg.lookup_key}:`, JSON.stringify(error));
      }
    } else {
      console.log(`Attached products to package ${pkg.lookup_key}`);
    }
  };

  const arenaPassPkg           = await ensurePackage("arena_pass_monthly",       "Arena Pass Monthly");
  const coins200Pkg            = await ensurePackage("coins_200",                "200 Coins");
  const coins550Pkg            = await ensurePackage("coins_550",                "550 Coins");
  const coins1200Pkg           = await ensurePackage("coins_1200",               "1200 Coins");
  const coins2800Pkg           = await ensurePackage("coins_2800",               "2800 Coins");
  const bronzePackPkg          = await ensurePackage("pack_bronze",              "Bronze Pack");
  const silverPackPkg          = await ensurePackage("pack_silver",              "Silver Pack");
  const goldPackPkg            = await ensurePackage("pack_gold",                "Gold Pack");
  const megaPackPkg            = await ensurePackage("pack_mega",                "Mega Bundle");
  const guaranteedLegendaryPkg = await ensurePackage("pack_guaranteed_legendary","Guaranteed Legendary");
  const holographicPkg         = await ensurePackage("cosmetic_holographic",     "Holographic Frame");
  const neonPkg                = await ensurePackage("cosmetic_neon",            "Neon Glow");
  const mangaPkg               = await ensurePackage("cosmetic_manga",           "Manga Style");
  const cardBackPkg            = await ensurePackage("cosmetic_card_back",       "Exclusive Card Back");

  await attachPkg(arenaPassPkg,           [testArenaPass,         iosArenaPass,         playArenaPass]);
  await attachPkg(coins200Pkg,            [test200,               ios200,               play200]);
  await attachPkg(coins550Pkg,            [test550,               ios550,               play550]);
  await attachPkg(coins1200Pkg,           [test1200,              ios1200,              play1200]);
  await attachPkg(coins2800Pkg,           [test2800,              ios2800,              play2800]);
  await attachPkg(bronzePackPkg,          [testBronzePack,        iosBronzePack,        playBronzePack]);
  await attachPkg(silverPackPkg,          [testSilverPack,        iosSilverPack,        playSilverPack]);
  await attachPkg(goldPackPkg,            [testGoldPack,          iosGoldPack,          playGoldPack]);
  await attachPkg(megaPackPkg,            [testMegaPack,          iosMegaPack,          playMegaPack]);
  await attachPkg(guaranteedLegendaryPkg, [testGuaranteedLegendary, iosGuaranteedLegendary, playGuaranteedLegendary]);
  await attachPkg(holographicPkg,         [testHolographic,       iosHolographic,       playHolographic]);
  await attachPkg(neonPkg,                [testNeon,              iosNeon,              playNeon]);
  await attachPkg(mangaPkg,              [testManga,             iosManga,             playManga]);
  await attachPkg(cardBackPkg,            [testCardBack,          iosCardBack,          playCardBack]);

  console.log("\n====================");
  console.log("Arena RevenueCat setup complete!");
  console.log("Arena Pass Entitlement:", ARENA_PASS_ENTITLEMENT);
  console.log("Arena Offering:", ARENA_OFFERING_KEY);
  console.log("Packages created: 14 total");
  console.log("====================\n");
  console.log("Coin bundle product IDs:");
  console.log("  200 coins  →", COIN_200_ID);
  console.log("  550 coins  →", COIN_550_ID);
  console.log("  1200 coins →", COIN_1200_ID);
  console.log("  2800 coins →", COIN_2800_ID);
  console.log("Pack IAP product IDs:");
  console.log("  Bronze              →", PACK_BRONZE_ID);
  console.log("  Silver              →", PACK_SILVER_ID);
  console.log("  Gold                →", PACK_GOLD_ID);
  console.log("  Mega                →", PACK_MEGA_ID);
  console.log("  Guaranteed Legendary→", PACK_GUARANTEED_LEGENDARY_ID);
  console.log("Cosmetic product IDs:");
  console.log("  Holographic →", COSMETIC_HOLOGRAPHIC_ID);
  console.log("  Neon        →", COSMETIC_NEON_ID);
  console.log("  Manga       →", COSMETIC_MANGA_ID);
  console.log("  Card Back   →", COSMETIC_CARD_BACK_ID);
}

seedArenaRevenueCat().catch(console.error);
