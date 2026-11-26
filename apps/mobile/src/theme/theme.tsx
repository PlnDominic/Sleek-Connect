import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { getDeviceStorage } from '@/lib/storage';
import { darkPalette, lightPalette, type Palette } from './palette';

export type { Palette };
export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'theme-mode';

interface ThemeValue {
  mode: ThemeMode;
  scheme: 'light' | 'dark';
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue>({
  mode: 'light',
  scheme: 'light',
  colors: lightPalette,
  setMode: () => {},
});

function readMode(): ThemeMode {
  try {
    const saved = getDeviceStorage().getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const system = useColorScheme();
  const scheme: 'light' | 'dark' = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  // Keep native pieces (keyboard, alerts, date pickers) in step with the chosen look.
  useEffect(() => {
    // Not available in the web preview, where the page's own colours already follow our palette.
    Appearance.setColorScheme?.(mode === 'system' ? 'unspecified' : mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      getDeviceStorage().setItem(KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ mode, scheme, colors: scheme === 'dark' ? darkPalette : lightPalette, setMode }),
    [mode, scheme, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
export const useColors = () => useContext(ThemeContext).colors;

/** Builds a screen's styles once per colour scheme. */
export function useStyles<T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(make: (colors: Palette) => T): T {
  const colors = useColors();
  return useMemo(() => make(colors), [make, colors]);
}
