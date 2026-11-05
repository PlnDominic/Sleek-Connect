import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type IconName } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { CountBadge } from '@/components/ui';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const items: { label: string; icon: IconName; route: string }[] = [
  { label: 'Home', icon: 'home', route: 'index' },
  { label: 'Shop', icon: 'grid', route: 'shop' },
  { label: 'Saved', icon: 'heart', route: 'saved' },
  { label: 'Bag', icon: 'bag', route: 'bag' },
  { label: 'Account', icon: 'user', route: 'account' },
];

function TabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const { count } = useBag();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar} accessibilityRole="tablist">
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
              style={[styles.item, active ? styles.itemActive : styles.itemIdle]}
            >
              <View>
                <Icon name={item.icon} size={22} color={BLACK} strokeWidth={active ? 2 : 1.8} />
                {item.route === 'bag' && <CountBadge count={count} style={styles.badge} />}
              </View>
              {active && (
                <AppText weight="bold" size={14} color={BLACK}>
                  {item.label}
                </AppText>
              )}
            </Pressable>
          );
        })}
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

const BLACK = '#0A0A0A';

// A floating black pill: the current tab is a white pill with its name, the others are round grey buttons.
const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BLACK,
    borderRadius: 999,
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: {
    height: 48,
    minWidth: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  itemActive: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
  },
  itemIdle: {
    backgroundColor: '#E8E8E8',
  },
  badge: {
    right: -10,
    top: -6,
  },
});
