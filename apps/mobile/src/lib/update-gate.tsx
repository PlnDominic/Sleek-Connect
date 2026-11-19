import * as Application from 'expo-application';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Form';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/theme/theme';

const PACKAGE = 'com.sleekconnect.store';

/**
 * Asks the store which app build is the oldest still allowed (Admin can raise it when a database change would break older builds) and,
 * for an older build, shows "please update" instead of a screen that fails. If the answer can't be fetched the app opens as normal.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const colors = useColors();
  const [mustUpdate, setMustUpdate] = useState(false);

  useEffect(() => {
    // Only the real store build: Expo Go and the web preview have other build numbers.
    if (Application.applicationId !== PACKAGE) return;
    const build = Number(Application.nativeBuildVersion);
    if (!Number.isFinite(build)) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_app_requirements').single();
        const minimum = Number((data as { min_app_build?: number } | null)?.min_app_build ?? 0);
        if (!cancelled && !error && build < minimum) setMustUpdate(true);
      } catch {
        // Offline or unavailable: let the app open.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mustUpdate) return <>{children}</>;
  const open = () =>
    void Linking.openURL(Platform.OS === 'android' ? `market://details?id=${PACKAGE}` : 'https://apps.apple.com/app/sleek-connect-store').catch(() =>
      Linking.openURL(`https://play.google.com/store/apps/details?id=${PACKAGE}`),
    );
  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <AppText weight="bold" size={22} accessibilityRole="header" style={styles.text}>
        Please update the app
      </AppText>
      <AppText size={15} color={colors.textMuted} style={styles.text}>
        This version is out of date and can no longer connect to the store. Update to the newest version to keep shopping.
      </AppText>
      <Button label="Update now" onPress={open} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  text: { textAlign: 'center' },
});
