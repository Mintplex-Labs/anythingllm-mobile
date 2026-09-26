// Hermes does not ship Intl.PluralRules on every Android build - i18next needs it for `_one`/`_other` keys.
// The polyfill only installs itself when the runtime is missing it.
import "intl-pluralrules";
import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import { I18nManager, NativeModules, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultNS, resources } from "@/locales/resources";
import LANGUAGE_LIST from "@/locales/languages.json";

export type Language = {
  code: string;
  nativeName: string;
  englishName: string;
};

export const FALLBACK_LANGUAGE = "en";
const STORAGE_KEY = "app_language";

/** Languages the user can pick - only those that actually have a dictionary bundled. */
export const LANGUAGES: Language[] = (LANGUAGE_LIST as Language[]).filter(
  lang => lang.code in resources,
);

/** Locales the OS reports for this user, most preferred first, eg. ["pt-BR", "en-US"]. */
function deviceLocales(): string[] {
  const locales: string[] = [];
  try {
    if (Platform.OS === "ios") {
      const settings = NativeModules.SettingsManager?.settings;
      locales.push(...(settings?.AppleLanguages ?? []), settings?.AppleLocale);
    } else {
      // Reflects the Android 13+ per-app language when one is set, otherwise the system language.
      locales.push(I18nManager.getConstants().localeIdentifier ?? "");
    }
  } catch {}
  try {
    locales.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {}
  return locales.filter(Boolean).map(locale => locale.replace(/_/g, "-"));
}

/**
 * Map an OS locale onto one of our dictionaries: an exact match first, then Chinese script/region
 * variants, then any dictionary for the same base language (pt-PT -> pt-BR).
 */
export function matchLanguage(locale: string): string | null {
  const lower = locale.toLowerCase();
  const codes = LANGUAGES.map(lang => lang.code);
  const exact = codes.find(code => code.toLowerCase() === lower);
  if (exact) return exact;

  const [base, ...rest] = lower.split("-");
  if (base === "zh") {
    const traditional = rest.some(part => ["hant", "tw", "hk", "mo"].includes(part));
    const code = traditional ? "zh-TW" : "zh";
    if (codes.includes(code)) return code;
  }
  return codes.find(code => code.toLowerCase().split("-")[0] === base) ?? null;
}

export function detectDeviceLanguage(): string {
  for (const locale of deviceLocales()) {
    const match = matchLanguage(locale);
    if (match) return match;
  }
  return FALLBACK_LANGUAGE;
}

i18n.use(initReactI18next).init({
  // Language files hold null for untranslated entries, which the Resource type does not model.
  resources: resources as unknown as Resource,
  defaultNS,
  lng: detectDeviceLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  // Untranslated entries are null (or empty) in a language file - show the English string instead.
  returnNull: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

let hydration: Promise<void> | null = null;
/** Apply the language the user picked in Settings, if any. Safe to call many times. */
export function hydrateLanguage(): Promise<void> {
  if (!hydration) {
    hydration = AsyncStorage.getItem(STORAGE_KEY)
      .then(async saved => {
        if (saved && saved in resources && saved !== i18n.language)
          await i18n.changeLanguage(saved);
      })
      .catch(() => {});
  }
  return hydration;
}

/** Switch the UI language and remember it across launches. */
export async function setLanguage(code: string) {
  if (!(code in resources)) throw new Error(`Unsupported language: ${code}`);
  await AsyncStorage.setItem(STORAGE_KEY, code);
  await i18n.changeLanguage(code);
}

/**
 * Marks a translation key that is stored now and passed to t() later - eg. titles in a module-level
 * constant array. It returns the key unchanged; the translation scripts use it to find keys in use.
 */
export const tKey = (key: string) => key;

export function currentLanguage(): string {
  return i18n.resolvedLanguage ?? i18n.language ?? FALLBACK_LANGUAGE;
}

export default i18n;
