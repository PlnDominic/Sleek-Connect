import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { colors } from '@sleek/shared';
import { BagProvider } from '@sleek/shared/bag';
import { AuthProvider } from '@/lib/auth';
import { PushSetup } from '@/lib/push';
import { getDeviceStorage } from '@/lib/storage';
import { fontFiles } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts(fontFiles);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  // The bag is kept on the phone between visits.
  return (
    <AuthProvider>
      <BagProvider storage={getDeviceStorage}>
        <StatusBar style="dark" />
        <PushSetup />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
      </BagProvider>
    </AuthProvider>
  );
}
