import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { TabIcon, type TabIconName } from '@/components/TabIcon';
import { CountBadge } from '@/components/ui';
import { useStyles, useTheme, type Palette } from '@/theme/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const items: { label: string; icon: TabIconName; route: string }[] = [
  { label: 'Home', icon: 'home', route: 'index' },
  { label: 'Shop', icon: 'shop', route: 'shop' },
  { label: 'Saved', icon: 'saved', route: 'saved' },
  { label: 'Bag', icon: 'bag', route: 'bag' },
  { label: 'Account', icon: 'account', route: 'account' },
];

function TabBar({ state, navigateToTab }: TabBarProps) {
  const { colors, scheme } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const { count } = useBag();
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((on) => live && setReduceTransparency(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  // Glass only where blur is dependable (iOS); Android and Reduce Transparency get a near-opaque bar.
  const glass = Platform.OS === 'ios' && !reduceTransparency;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.shadow}>
        <View style={styles.clip}>
          {glass ? (
            <BlurView intensity={70} tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={[StyleSheet.absoluteFill, glass ? styles.fillGlass : styles.fillSolid]} />
          <View style={styles.sheen} pointerEvents="none" />
          <View style={styles.row} accessibilityRole="tablist">
            {items.map((item) => {
              const active = item.route === current;
              return (
                <Pressable
                  key={item.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.route === 'bag' ? `Bag, ${count} ${count === 1 ? 'item' : 'items'}` : item.label}
                  onPress={() => {
                    const route = state.routes.find((r) => r.name === item.route);
                    if (route) navigateToTab(route.key);
                  }}
                  style={styles.item}
                >
                  <View style={[styles.lens, active && styles.lensActive]}>
                    <View>
                      <TabIcon name={item.icon} color={active ? colors.ink : colors.tabIdle} active={active} />
                      {item.route === 'bag' && <CountBadge count={count} style={styles.badge} />}
                    </View>
                    <AppText weight={active ? 'bold' : 'medium'} size={11} color={active ? colors.ink : colors.tabIdle}>
                      {item.label}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="shop" />
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="bag" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

// Liquid Glass tab bar: a floating, blurred capsule over the content. The current tab sits in a
// brighter glass lens; colour is spent once, on the active icon and name.
const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  shadow: {
    borderRadius: 36,
    shadowColor: colors.tabShadow,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  clip: {
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.tabEdge,
  },
  fillGlass: { backgroundColor: colors.tabFill },
  fillSolid: { backgroundColor: colors.surface },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.tabEdge,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
  },
  item: {
    flex: 1,
    minHeight: 56,
  },
  lens: {
    flex: 1,
    minHeight: 56,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  lensActive: {
    backgroundColor: colors.tabLens,
    shadowColor: colors.tabShadow,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  badge: {
    right: -10,
    top: -6,
  },
});
