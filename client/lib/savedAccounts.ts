import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export interface SavedAccount {
  username: string;
  displayName: string;
  role: "coach" | "player" | "owner" | "parent";
  avatarUrl?: string;
  lastLogin: number;
}

const SAVED_ACCOUNTS_KEY = "gus_saved_accounts_v2";

function sanitizeAvatarUrl(avatarUrl?: string | null): string | undefined {
  if (!avatarUrl || typeof avatarUrl !== "string") return undefined;
  const trimmed = avatarUrl.trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  return trimmed;
}

async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setStorageItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export async function getSavedAccounts(): Promise<SavedAccount[]> {
  try {
    const data = await getStorageItem(SAVED_ACCOUNTS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as SavedAccount[];
    let needsRewrite = false;
    const accounts = parsed.map((account) => {
      const cleanAvatar = sanitizeAvatarUrl(account.avatarUrl);
      if (cleanAvatar !== account.avatarUrl) {
        needsRewrite = true;
        return { ...account, avatarUrl: cleanAvatar };
      }
      return account;
    });
    if (needsRewrite) {
      try {
        await setStorageItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
      } catch {
      }
    }
    return accounts.sort((a, b) => b.lastLogin - a.lastLogin);
  } catch {
    return [];
  }
}

export async function saveAccount(
  username: string,
  displayName: string,
  role: "coach" | "player" | "owner" | "parent",
  avatarUrl?: string
): Promise<void> {
  try {
    const accounts = await getSavedAccounts();
    const existingIndex = accounts.findIndex(
      (a) => a.username.toLowerCase() === username.toLowerCase()
    );

    const account: SavedAccount = {
      username: username.toLowerCase(),
      displayName,
      role,
      avatarUrl: sanitizeAvatarUrl(avatarUrl),
      lastLogin: Date.now(),
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = account;
    } else {
      accounts.unshift(account);
    }

    const limitedAccounts = accounts.slice(0, 10);
    await setStorageItem(SAVED_ACCOUNTS_KEY, JSON.stringify(limitedAccounts));
  } catch (error) {
    console.error("Failed to save account:", error);
  }
}

export async function removeAccount(username: string): Promise<void> {
  try {
    const accounts = await getSavedAccounts();
    const filtered = accounts.filter(
      (a) => a.username.toLowerCase() !== username.toLowerCase()
    );
    await setStorageItem(SAVED_ACCOUNTS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to remove account:", error);
  }
}

export async function checkBiometricSupport(): Promise<{
  available: boolean;
  biometryType: string | null;
}> {
  try {
    if (Platform.OS === "web") {
      return { available: false, biometryType: null };
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { available: false, biometryType: null };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      return { available: false, biometryType: null };
    }

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let biometryType: string | null = null;

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometryType = "Face ID";
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometryType = "Fingerprint";
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometryType = "Iris";
    }

    return { available: true, biometryType };
  } catch {
    return { available: false, biometryType: null };
  }
}
