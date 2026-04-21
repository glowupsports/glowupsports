import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "./locales/en.json";
import ar from "./locales/ar.json";
import id from "./locales/id.json";
import nl from "./locales/nl.json";

const LANGUAGE_STORAGE_KEY = "@glow_app_language";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", rtl: false },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", rtl: true },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", rtl: false },
  { code: "nl", label: "Dutch", nativeLabel: "Nederlands", rtl: false },
] as const;

export type LanguageCode = "en" | "ar" | "id" | "nl";

const resources = {
  en: { translation: en },
  ar: { translation: ar },
  id: { translation: id },
  nl: { translation: nl },
};

const getDeviceLanguage = (): LanguageCode => {
  try {
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const deviceLang = locales[0].languageCode;
      if (deviceLang === "ar" || deviceLang === "id" || deviceLang === "nl") {
        return deviceLang;
      }
    }
  } catch (e) {}
  return "en";
};

export const getStoredLanguage = async (): Promise<LanguageCode | null> => {
  try {
    const lang = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (lang === "en" || lang === "ar" || lang === "id" || lang === "nl") return lang;
    return null;
  } catch {
    return null;
  }
};

export const setStoredLanguage = async (lang: LanguageCode): Promise<void> => {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {}
};

export const initializeI18n = async () => {
  // Initialize synchronously with device language so the app is never blocked
  // waiting on AsyncStorage before i18n is ready.
  const fallbackLang = getDeviceLanguage();

  await i18n.use(initReactI18next).init({
    resources,
    lng: fallbackLang,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

  // Check stored preference in the background; update language if needed.
  // This won't delay app startup — it resolves asynchronously after the UI is visible.
  getStoredLanguage().then(storedLang => {
    if (storedLang && storedLang !== i18n.language) {
      i18n.changeLanguage(storedLang);
    }
  });

  return i18n;
};

export const isRTL = (lang?: string): boolean => {
  return (lang || i18n.language) === "ar";
};

export default i18n;
