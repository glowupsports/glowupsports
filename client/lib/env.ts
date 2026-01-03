type EnvConfig = {
  EXPO_PUBLIC_DOMAIN: string;
  EXPO_PUBLIC_ENV: "development" | "preview" | "production";
};

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
  const domain = getEnvVar("EXPO_PUBLIC_DOMAIN");
  const env = process.env.EXPO_PUBLIC_ENV || "development";
  
  if (!["development", "preview", "production"].includes(env)) {
    console.warn(`[ENV] Unknown EXPO_PUBLIC_ENV value: ${env}, defaulting to development`);
  }

  return {
    EXPO_PUBLIC_DOMAIN: domain,
    EXPO_PUBLIC_ENV: env as EnvConfig["EXPO_PUBLIC_ENV"],
  };
}

export function getEnv(): EnvConfig {
  return {
    EXPO_PUBLIC_DOMAIN: process.env.EXPO_PUBLIC_DOMAIN || "",
    EXPO_PUBLIC_ENV: (process.env.EXPO_PUBLIC_ENV as EnvConfig["EXPO_PUBLIC_ENV"]) || "development",
  };
}

export function logEnvStatus(): void {
  const env = getEnv();
  console.log("=== ENV STATUS ===");
  console.log("EXPO_PUBLIC_DOMAIN:", env.EXPO_PUBLIC_DOMAIN || "NOT SET");
  console.log("EXPO_PUBLIC_ENV:", env.EXPO_PUBLIC_ENV || "NOT SET");
  console.log("==================");
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
