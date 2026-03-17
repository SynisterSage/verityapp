import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppTheme, getTheme, ThemeMode } from '../theme/tokens';

type ThemePreference = ThemeMode | 'system';

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  isUsingSystemTheme: boolean;
  setMode: (mode: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

const THEME_PREFERENCE_KEY = 'safecall:theme-mode';

const getSystemMode = (): ThemeMode => {
  const colorScheme = Appearance.getColorScheme();
  return colorScheme === 'light' ? 'light' : 'dark';
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [systemMode, setSystemMode] = useState<ThemeMode>(() => getSystemMode());
  const [preference, setPreference] = useState<ThemePreference>('system');
  const mode = preference === 'system' ? systemMode : preference;
  const theme = useMemo(() => getTheme(mode), [mode]);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((storedMode) => {
        if (!isMounted) {
          return;
        }
        if (storedMode === 'light' || storedMode === 'dark') {
          setPreference(storedMode);
        } else {
          setPreference('system');
        }
      })
      .catch(() => null);
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme === 'light' || colorScheme === 'dark') {
        setSystemMode(colorScheme);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const setMode = useCallback((nextMode: ThemePreference) => {
    if (nextMode === 'system') {
      setPreference('system');
      AsyncStorage.removeItem(THEME_PREFERENCE_KEY).catch(() => null);
      return;
    }
    setPreference(nextMode);
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, nextMode).catch(() => null);
  }, []);

  const contextValue = useMemo(
    () => ({
      mode,
      theme,
      isUsingSystemTheme: preference === 'system',
      setMode,
    }),
    [mode, preference, theme, setMode]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
