import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, radii, type IconName } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { useScreenTop } from '@/components/ui';
import { openSite, siteConfigured } from '@/lib/site';

const links: { icon: IconName; title: string; text: string; path: string }[] = [
  { icon: 'box', title: 'Track an order', text: 'Check where your order is with your order number', path: '/track' },
  { icon: 'user', title: 'Your account and orders', text: 'Sign in on the website to see orders and addresses', path: '/account' },
  { icon: 'headset', title: 'Help and contact', text: 'Delivery, returns and how to reach us', path: '/help' },
  { icon: 'lock', title: 'Privacy notice', text: 'How we use your data', path: '/privacy' },
  { icon: 'clipboard', title: 'Terms of service', text: 'The terms for shopping with us', path: '/terms' },
];

export default function AccountScreen() {
  const top = useScreenTop();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top }]}>
      <AppText weight="semibold" size={22} accessibilityRole="header">
        Account
      </AppText>
      <View style={styles.note}>
        <AppText weight="bold" size={14}>
          Signing in is coming to the app
        </AppText>
        <AppText size={13} color={colors.textMuted} style={styles.lh}>
          You can already browse, save items and fill your bag here. For orders, addresses and tracking, use the website for now.
        </AppText>
      </View>
      <View style={styles.list}>
        {links.map((l) => (
          <Pressable
            key={l.path}
            accessibilityRole="link"
            accessibilityLabel={`${l.title}. Opens the website`}
            disabled={!siteConfigured}
            onPress={() => void openSite(l.path)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }, !siteConfigured && { opacity: 0.4 }]}
          >
            <View style={styles.icon}>
              <Icon name={l.icon} size={20} color={colors.ink} />
            </View>
            <View style={styles.flex}>
              <AppText weight="bold" size={15}>
                {l.title}
              </AppText>
              <AppText size={13} color={colors.textMuted}>
                {l.text}
              </AppText>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 18,
  },
  flex: {
    flex: 1,
  },
  lh: {
    lineHeight: 19,
  },
  note: {
    gap: 6,
    padding: 16,
    borderRadius: radii.xl,
    backgroundColor: colors.tealSoft,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 68,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
