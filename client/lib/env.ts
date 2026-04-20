import logger from "./logger";
type EnvConfig = {
  EXPO_PUBLIC_API_URL: string;
  EXPO_PUBLIC_DOMAIN: string;
  EXPO_PUBLIC_ENV: "development" | "preview" | "production";
};

const PRODUCTION_FALLBACK_DOMAIN = "glow-up-sports--ltvjeugd.replit.app";

function isBuiltApp(): boolean {
  // In an EAS release build `__DEV__` is always false. That alone is
  // enough to consider this a built app — we should NOT additionally
  // require EXPO_PUBLIC_ENV !== "development", because a misbuilt OTA
  // bundle may have "development" baked in (e.g. when the OTA push
  // forgot to inject the production env). In that case we still want
  // the runtime fallback to kick in instead of crashing the login
  // screen. In Expo Go / `npm run dev`, __DEV__ is true, so the
  // strict throw in validateEnv() still fires for local misconfig.
  const dev = (typeof __DEV__ !== "undefined" ? __DEV__ : true) as boolean;
  return !dev;
}

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Make sure this is set in:\n` +
      `- Replit: package.json scripts or Secrets\n` +
      `- EAS Build: eas.json env section\n` +
      `- Expo Dashboard: Environment Variables`
    );
  }
  return value;
}

export function validateEnv(): EnvConfig {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const env = process.env.EXPO_PUBLIC_ENV || "development";

  if (!apiUrl && !domain) {
    // In a built app (production/preview/EAS) the env should always be
    // injected, but if it isn't (mis-built bundle, env-var stripping, or
    // a runtime hydration race) we don't want to brick the entire login
    // screen. Fall back to the canonical production domain and warn so
    // we still see it in Sentry/console.
    if (isBuiltApp()) {
      logger.warn(
        `[ENV] EXPO_PUBLIC_API_URL and EXPO_PUBLIC_DOMAIN both missing in a built app — ` +
        `falling back to ${PRODUCTION_FALLBACK_DOMAIN}. Check your eas.json env section.`
      );
      const rawEnv = process.env.EXPO_PUBLIC_ENV;
      // If the bundle was misbuilt and EXPO_PUBLIC_ENV is missing OR
      // accidentally "development" inside a real release build, treat it
      // as "production" — we already know we're on the production fallback
      // domain so anything else would mislead analytics/feature flags.
      const safeEnv: EnvConfig["EXPO_PUBLIC_ENV"] =
        rawEnv === "preview" || rawEnv === "production" ? rawEnv : "production";
      return {
        EXPO_PUBLIC_API_URL: `https://${PRODUCTION_FALLBACK_DOMAIN}`,
        EXPO_PUBLIC_DOMAIN: PRODUCTION_FALLBACK_DOMAIN,
        EXPO_PUBLIC_ENV: safeEnv,
      };
    }

    throw new Error(
      `Missing required environment variable: EXPO_PUBLIC_API_URL or EXPO_PUBLIC_DOMAIN\n` +
      `Make sure this is set in:\n` +
      `- Replit: package.json scripts or Secrets\n` +
      `- EAS Build: eas.json env section\n` +
      `- Expo Dashboard: Environment Variables\n` +
      `(Built apps automatically fall back to ${PRODUCTION_FALLBACK_DOMAIN}; this throw only fires in dev.)`
    );
  }

  if (!["development", "preview", "production"].includes(env)) {
    console.warn(`[ENV] Unknown EXPO_PUBLIC_ENV value: ${env}, defaulting to development`);
  }

  return {
    EXPO_PUBLIC_API_URL: apiUrl || `https://${domain}`,
    EXPO_PUBLIC_DOMAIN: domain || apiUrl?.replace(/^https?:\/\//, "") || "",
    EXPO_PUBLIC_ENV: env as EnvConfig["EXPO_PUBLIC_ENV"],
  };
}

export function getEnv(): EnvConfig {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!apiUrl && !domain && isBuiltApp()) {
    const rawEnv = process.env.EXPO_PUBLIC_ENV;
    const safeEnv: EnvConfig["EXPO_PUBLIC_ENV"] =
      rawEnv === "preview" || rawEnv === "production" ? rawEnv : "production";
    return {
      EXPO_PUBLIC_API_URL: `https://${PRODUCTION_FALLBACK_DOMAIN}`,
      EXPO_PUBLIC_DOMAIN: PRODUCTION_FALLBACK_DOMAIN,
      EXPO_PUBLIC_ENV: safeEnv,
    };
  }
  return {
    EXPO_PUBLIC_API_URL: apiUrl || (domain ? `https://${domain}` : ""),
    EXPO_PUBLIC_DOMAIN: domain || apiUrl?.replace(/^https?:\/\//, "") || "",
    EXPO_PUBLIC_ENV: (process.env.EXPO_PUBLIC_ENV as EnvConfig["EXPO_PUBLIC_ENV"]) || "development",
  };
}

export function logEnvStatus(): void {
  const env = getEnv();
  logger.log("=== ENV STATUS ===");
  logger.log("EXPO_PUBLIC_API_URL:", env.EXPO_PUBLIC_API_URL || "NOT SET");
  logger.log("EXPO_PUBLIC_DOMAIN:", env.EXPO_PUBLIC_DOMAIN || "NOT SET");
  logger.log("EXPO_PUBLIC_ENV:", env.EXPO_PUBLIC_ENV || "NOT SET");
  logger.log("==================");
}

export function isProduction(): boolean {
  return getEnv().EXPO_PUBLIC_ENV === "production";
}

export function isDevelopment(): boolean {
  return getEnv().EXPO_PUBLIC_ENV === "development";
}

export function isPreview(): boolean {
  return getEnv().EXPO_PUBLIC_ENV === "preview";
}
