'use client';

import { useLayoutEffect } from 'react';

export type ThemePreference = 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme';

export function applyTheme(pref: ThemePreference) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.remove('light', 'dark');

  root.classList.add(pref);
  window.localStorage.setItem(THEME_STORAGE_KEY, pref);
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return 'light';
}

export function ThemeInitializer() {
  useLayoutEffect(() => {
    const pref = getStoredTheme();
    const root = document.documentElement;
    const current: ThemePreference | null = root.classList.contains('dark')
      ? 'dark'
      : root.classList.contains('light')
        ? 'light'
        : null;

    // Avoid unnecessary DOM class churn if the correct theme is already applied.
    if (current === pref) return;

    applyTheme(pref);
  }, []);

  return null;
}

