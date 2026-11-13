'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';
type ThemeContextValue = { theme: Theme; toggleTheme: () => void; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'leonardx-theme';
const THEME_CHANGE_EVENT = 'leonardx-theme-change';
let currentTheme: Theme | null = null;

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getThemeSnapshot(): Theme {
  currentTheme ??= readStoredTheme();
  return currentTheme;
}

function getServerThemeSnapshot(): Theme {
  return 'light';
}

function subscribeToTheme(onChange: () => void) {
  const handleLocalChange = () => onChange();
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    currentTheme = readStoredTheme();
    applyTheme(currentTheme);
    onChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleLocalChange);
  window.addEventListener('storage', handleStorageChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleLocalChange);
    window.removeEventListener('storage', handleStorageChange);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  const setTheme = useCallback((next: Theme) => {
    currentTheme = next;
    applyTheme(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage is optional. */ }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);
  const toggleTheme = useCallback(() => setTheme(theme === 'light' ? 'dark' : 'light'), [setTheme, theme]);
  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useThemePreference must be used within ThemeProvider');
  return context;
}
