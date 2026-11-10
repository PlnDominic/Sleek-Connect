import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BagProvider } from '@sleek/shared/bag';
import { AuthProvider } from '@/lib/auth';
import { PushSetup } from '@/lib/push';
import { getDeviceStorage } from '@/lib/storage';
import { UpdateGate } from '@/lib/update-gate';
import { fontFiles } from '@/theme/fonts';
import { ThemeProvider, useTheme } from '@/theme/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts(fontFiles);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  // The bag is kept on the phone between visits.
  return (
    <ThemeProvider>
      <AuthProvider>
        <BagProvider storage={getDeviceStorage}>
          <ThemedShell />
        </BagProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function ThemedShell() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <UpdateGate>
        <PushSetup />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
      </UpdateGate>
    </>
  );
}
