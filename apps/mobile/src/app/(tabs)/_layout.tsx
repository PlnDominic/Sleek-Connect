import { Tabs, router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type IconName } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const items: { label: string; icon: IconName; route?: string }[] = [
  { label: 'Home', icon: 'home', route: 'index' },
  { label: 'Shop', icon: 'grid', route: 'shop' },
  { label: 'Saved', icon: 'heart', route: 'saved' },
  // Orders opens the tracking screen full-screen, as in the design.
  { label: 'Orders', icon: 'box' },
  { label: 'Account', icon: 'user', route: 'account' },
];

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 16) }]} accessibilityRole="tablist">
      {items.map((item) => {
        const active = item.route === current;
        const color = active ? colors.accent : colors.textMuted;
        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => (item.route ? navigation.navigate(item.route) : router.push('/track'))}
            style={styles.item}
          >
            <Icon name={item.icon} size={22} color={color} strokeWidth={active ? 2 : 1.8} />
            <AppText weight={active ? 'bold' : 'semibold'} size={11} color={color}>
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="shop" />
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
