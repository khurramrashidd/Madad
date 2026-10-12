import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { DICTIONARIES, FALLBACK, LANGUAGES } from '../i18n/strings.js';
import { istGreetingSlot } from '../lib/datetime.js';
import { api } from '../api/client.js';

/**
 * Translation, kept deliberately small.
 *
 * No i18n library: this needs string lookup with a fallback and one
 * interpolation, which is about twenty lines. Pulling in react-i18next would
 * add weight to an APK that is meant to run on cheap phones, for features
 * (plural rules, lazy namespaces, ICU messages) this app does not use.
 *
 * The choice is stored locally so it survives a signed-out cold start, and
 * mirrored to the account so it follows the user to another device.
 */
const I18nContext = createContext(null);

const STORAGE_KEY = 'madad_language';
const CODES = LANGUAGES.map((l) => l.code);

const readStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return CODES.includes(v) ? v : null;
  } catch {
    return null;
  }
};

/**
 * Guess from the browser before the user has said anything.
 * `hi-IN` → Hindi; anything else → English. Hinglish is never guessed, since
 * no browser reports it — it has to be chosen.
 */
const detect = () => {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    if (langs.some((l) => String(l).toLowerCase().startsWith('hi'))) return 'hi';
  } catch {
    /* fall through */
  }
  return 'en';
};

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => readStored() || detect());

  useEffect(() => {
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
  }, [lang]);

  const setLanguage = useCallback((next, { sync = true } = {}) => {
    if (!CODES.includes(next)) return;
    setLang(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    // Best-effort: failing to save a preference must not surface as an error.
    if (sync) api.users.updateMe({ preferences: { language: next } }).catch(() => {});
  }, []);

  /**
   * Look up a key.
   *
   * Falls back to English, and then to the key itself — a visible key is ugly
   * but tells a developer exactly what is missing, which beats an empty space
   * that looks like a layout bug.
   */
  const t = useCallback(
    (key, vars) => {
      const dict = DICTIONARIES[lang] || DICTIONARIES[FALLBACK];
      let value = dict[key];
      if (value === undefined) value = DICTIONARIES[FALLBACK][key];
      if (value === undefined) return key;

      if (Array.isArray(value) || !vars) return value;

      return String(value).replace(/\{(\w+)\}/g, (match, name) =>
        vars[name] !== undefined ? String(vars[name]) : match
      );
    },
    [lang]
  );

  /**
   * "Good morning" / "Good afternoon" / "Good evening".
   *
   * Keyed off the hour in IST rather than the device clock: this is an
   * India-only product, and a handset with the wrong timezone should not be
   * greeted "good morning" at nine at night.
   */
  const greeting = useCallback(
    (date = new Date()) => t(`greeting.${istGreetingSlot(date)}`),
    [t]
  );

  const value = useMemo(
    () => ({ lang, setLanguage, t, greeting, languages: LANGUAGES }),
    [lang, setLanguage, t, greeting]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Shorthand for the common case. */
export const useT = () => useI18n().t;

export default I18nContext;
