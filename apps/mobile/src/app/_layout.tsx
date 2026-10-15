import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { colors, getProduct, sampleBag } from '@sleek/shared';
import { BagProvider, bagItemFrom } from '@sleek/shared/bag';
import { fontFiles } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync();

// The app still reads the bundled catalogue; it moves to Supabase once mobile work starts.
const initialBag = sampleBag.flatMap((line) => {
  const product = getProduct(line.slug);
  return product ? [bagItemFrom(product, line.sizeId, line.qty)] : [];
});

export default function RootLayout() {
  const [loaded, error] = useFonts(fontFiles);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <BagProvider initialItems={initialBag}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
    </BagProvider>
  );
}
