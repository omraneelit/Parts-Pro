// User-controlled colour scheme for Parts Pro. The app ships light & dark
// palettes (constants/theme), but previously only followed the OS. This adds a
// persisted preference (System / Light / Dark) with an in-app toggle, mirroring
// the language picker. The resolved scheme drives useTheme() and the navigation
// theme. Persisted in secure storage so it survives restarts.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemePref = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

const KEY = 'pp_theme';

interface ThemeModeValue {
  preference: ThemePref;
  scheme: Scheme; // resolved: 'system' collapses to the OS scheme
  setPreference: (p: ThemePref) => void;
}

const ThemeModeContext = createContext<ThemeModeValue | null>(null);

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePref>('system');

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => {
        if (v === 'system' || v === 'light' || v === 'dark') setPreferenceState(v);
      })
      .catch(() => {});
  }, []);

  const setPreference = useCallback((p: ThemePref) => {
    setPreferenceState(p);
    SecureStore.setItemAsync(KEY, p).catch(() => {});
  }, []);

  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeModeValue>(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference],
  );
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
}
