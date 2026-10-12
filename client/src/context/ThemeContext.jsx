import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

/**
 * Light / dark / follow-the-system.
 *
 * Three states rather than a boolean, because "dark" and "whatever my phone
 * is doing" are genuinely different wishes, and a plain toggle silently
 * commits the user to one forever the first time they touch it.
 *
 * The theme is applied by setting `data-theme` on <html>, which flips the CSS
 * variables the whole palette is built from (see styles/index.css). Writing it
 * to localStorage synchronously on change — and reading it back in a blocking
 * script in index.html — is what prevents the white flash on a dark-mode cold
 * start.
 */
const ThemeContext = createContext(null);

const STORAGE_KEY = 'madad_theme';
const VALID = ['light', 'dark', 'system'];

const readStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
};

const systemPrefersDark = () => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the OS while the preference is 'system'. The listener is always
  // attached so switching back to 'system' is immediately correct.
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return undefined;
    }
    const onChange = (e) => setSystemDark(e.matches);
    // Safari < 14 only has the deprecated listener API.
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener
        ? mq.removeEventListener('change', onChange)
        : mq.removeListener(onChange);
    };
  }, []);

  const isDark = preference === 'dark' || (preference === 'system' && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // Keep the browser/OS chrome in step — on Android the status bar colour
    // comes from this, and a green bar above a dark app looks broken.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0E1316' : '#0B8A5B');

    /**
     * Inside the Android app the meta tag does nothing — the native status
     * bar has to be told separately, or dark mode leaves black icons on a
     * black bar and the time becomes unreadable.
     */
    if (window.Capacitor?.isNativePlatform?.()) {
      import('@capacitor/status-bar')
        .then(({ StatusBar, Style }) =>
          Promise.all([
            // Style refers to the CONTENT: Dark style means dark icons, which
            // is what a light background needs.
            StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }),
            StatusBar.setBackgroundColor({ color: isDark ? '#171D21' : '#FFFFFF' }),
          ])
        )
        .catch(() => {
          /* plugin absent on the web build */
        });
    }
  }, [isDark]);

  const setTheme = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setPreference(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the theme just won't persist */
    }
  }, []);

  /** What the toggle button does: straight to the opposite of what is shown. */
  const toggle = useCallback(() => setTheme(isDark ? 'light' : 'dark'), [isDark, setTheme]);

  const value = useMemo(
    () => ({ theme: preference, isDark, setTheme, toggle, options: VALID }),
    [preference, isDark, setTheme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

export default ThemeContext;
