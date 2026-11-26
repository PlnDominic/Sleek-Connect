import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useBag } from '@sleek/shared/bag';
import { useTheme } from '@/theme/theme';

/**
 * The system tab bar. On iOS 26 this is Apple's own Liquid Glass bar, exactly as in Contacts or Phone: the selected
 * tab sits on a glass pill that lifts into a magnifying lens when pressed and can be dragged from tab to tab, tinting
 * each icon it passes over. Older iOS gets the standard translucent bar, Android the Material bar.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { count } = useBag();
  return (
    <NativeTabs tintColor={colors.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shop">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md="storefront" />
        <NativeTabs.Trigger.Label>Shop</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} md="favorite" />
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* The bag is a drawer, not a tab: the tab never becomes selected, it just slides the drawer in. */}
      <NativeTabs.Trigger name="cart" disabled listeners={{ tabPress: () => router.push('/bag') }}>
        <NativeTabs.Trigger.Icon sf="bag" md="shopping_bag" />
        <NativeTabs.Trigger.Label>Bag</NativeTabs.Trigger.Label>
        {count > 0 ? <NativeTabs.Trigger.Badge>{String(count)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="person" />
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
