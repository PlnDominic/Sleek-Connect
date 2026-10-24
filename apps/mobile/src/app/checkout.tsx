import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, formatPrice, radii } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState } from '@/components/States';
import { BackButton, BottomBar, useScreenTop } from '@/components/ui';
import { checkoutHandoff, openSite, siteConfigured } from '@/lib/site';

const steps = [
  { icon: 'pin', title: 'Delivery details', text: 'Your name, phone and delivery area in Accra' },
  { icon: 'phone', title: 'Pay with Mobile Money', text: 'MTN MoMo, Telecel Cash or AT Money, approved on your phone' },
  { icon: 'box', title: 'Track your order', text: 'Updates by SMS from packing to delivery' },
] as const;

/**
 * Orders are placed and paid for on the website for now. This screen shows what is in the bag, then opens the secure
 * checkout with the same items already in place.
 */
export default function CheckoutScreen() {
  const top = useScreenTop();
  const { items, count, subtotal } = useBag();
  const soldOut = items.some((i) => i.inStock === false);

  if (items.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: top, paddingHorizontal: 20 }]}>
        <View style={styles.titleRow}>
          <BackButton fallback="/bag" />
          <AppText weight="semibold" size={22} accessibilityRole="header">
            Checkout
          </AppText>
        </View>
        <EmptyState
          icon="bag"
          title="Your bag is empty"
          message="Add something to your bag first."
          action={{ label: 'Start shopping', onPress: () => router.replace('/shop') }}
        />
      </View>
    );
  }

  const canContinue = siteConfigured && !soldOut;
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: top }]}>
        <View style={styles.titleRow}>
          <BackButton fallback="/bag" />
          <AppText weight="semibold" size={22} accessibilityRole="header">
            Checkout
          </AppText>
        </View>

        <View style={styles.card}>
          <AppText weight="bold" size={15} accessibilityRole="header">
            Your order · {count} {count === 1 ? 'item' : 'items'}
          </AppText>
          {items.map((item) => (
            <View key={`${item.slug}|${item.sizeId ?? ''}`} style={styles.line}>
              <ProductImage image={item.image} photo={item.photo} tint={item.tint} kind={item.kind} style={styles.thumb} iconSize={18} />
              <View style={styles.flex}>
                <AppText weight="semibold" size={14} numberOfLines={2}>
                  {item.name}
                </AppText>
                <AppText size={12} color={colors.textMuted}>
                  {[item.sizeLabel, `Qty ${item.qty}`].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <AppText weight="bold" size={14}>
                {formatPrice(item.lineTotal)}
              </AppText>
            </View>
          ))}
          <View style={styles.total}>
            <AppText size={14} color={colors.textMuted}>
              Subtotal
            </AppText>
            <AppText weight="bold" size={17}>
              {formatPrice(subtotal)}
            </AppText>
          </View>
          <AppText size={12} color={colors.textMuted}>
            Delivery is added and prices are confirmed on the next step.
          </AppText>
        </View>

        <View style={styles.card}>
          <AppText weight="bold" size={15} accessibilityRole="header">
            Finish on our secure website
          </AppText>
          <AppText size={13} color={colors.textMuted} style={styles.lh}>
            Your bag goes with you, so there is nothing to add again.
          </AppText>
          {steps.map((s, i) => (
            <View key={s.title} style={styles.step}>
              <View style={styles.stepIcon}>
                <Icon name={s.icon} size={18} color={colors.ink} />
              </View>
              <View style={styles.flex}>
                <AppText weight="bold" size={14}>
                  {i + 1}. {s.title}
                </AppText>
                <AppText size={13} color={colors.textMuted}>
                  {s.text}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        {soldOut && (
          <View style={styles.notice} accessibilityRole="alert">
            <Icon name="alert" size={18} color={colors.accentDeep} strokeWidth={2} />
            <AppText size={13} color={colors.accentDeep} style={styles.flex}>
              Something in your bag is sold out. Remove it in your bag to continue.
            </AppText>
          </View>
        )}
        {!siteConfigured && (
          <View style={styles.notice} accessibilityRole="alert">
            <Icon name="alert" size={18} color={colors.accentDeep} strokeWidth={2} />
            <AppText size={13} color={colors.accentDeep} style={styles.flex}>
              Checkout isn&apos;t set up in this version of the app yet.
            </AppText>
          </View>
        )}
      </ScrollView>

      <BottomBar>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
          disabled={!canContinue}
          onPress={() => void openSite(checkoutHandoff(items))}
          style={({ pressed }) => [styles.cta, !canContinue && styles.ctaOff, pressed && { opacity: 0.85 }]}
        >
          <Icon name="lock" size={16} color={canContinue ? colors.canvas : colors.textMuted} strokeWidth={2} />
          <AppText weight="bold" size={16} color={canContinue ? colors.canvas : colors.textMuted}>
            Continue to secure checkout
          </AppText>
        </Pressable>
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 130,
    gap: 16,
  },
  flex: {
    flex: 1,
  },
  lh: {
    lineHeight: 19,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  card: {
    gap: 12,
    padding: 18,
    borderRadius: radii.xl,
    backgroundColor: colors.canvas,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: '#FDF0D6',
  },
  cta: {
    height: 54,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaOff: {
    backgroundColor: colors.surfaceSunken,
  },
});
