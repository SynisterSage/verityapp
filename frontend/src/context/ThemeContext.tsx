import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppTheme, getTheme, ThemeMode } from '../theme/tokens';

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
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
  const [mode, setModeState] = useState<ThemeMode>(() => getSystemMode());
  const [hasManualPreference, setHasManualPreference] = useState(false);
  const theme = useMemo(() => getTheme(mode), [mode]);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((storedMode) => {
        if (!isMounted) {
          return;
        }
        if (storedMode === 'light' || storedMode === 'dark') {
          setModeState(storedMode);
          setHasManualPreference(true);
        } else {
          setModeState(getSystemMode());
        }
      })
      .catch(() => null);
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (hasManualPreference) {
      return;
    }
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme === 'light' || colorScheme === 'dark') {
        setModeState(colorScheme);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [hasManualPreference]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    setHasManualPreference(true);
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, nextMode).catch(() => null);
  }, []);

  const contextValue = useMemo(
    () => ({
      mode,
      theme,
      setMode,
    }),
    [mode, theme, setMode]
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
