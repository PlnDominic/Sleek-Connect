import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, formatPrice, radii } from '@sleek/shared';
import { MAX_ITEM_QTY, useBag, type ResolvedBagItem } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState } from '@/components/States';
import { useScreenTop } from '@/components/ui';

export default function BagScreen() {
  const top = useScreenTop();
  const { items, count, subtotal, setQty, remove } = useBag();
  const soldOut = items.filter((i) => i.inStock === false);

  if (items.length === 0) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top }]}>
        <AppText weight="semibold" size={22} accessibilityRole="header">
          Your bag
        </AppText>
        <EmptyState
          icon="bag"
          title="Your bag is empty"
          message="Find something you like and add it to your bag."
          action={{ label: 'Start shopping', onPress: () => router.push('/shop') }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: top }]}>
        <View style={styles.titleRow}>
          <AppText weight="semibold" size={22} accessibilityRole="header">
            Your bag
          </AppText>
          <AppText size={14} color={colors.textMuted}>
            {count} {count === 1 ? 'item' : 'items'}
          </AppText>
        </View>

        {soldOut.length > 0 && (
          <View style={styles.notice} accessibilityRole="alert">
            <Icon name="alert" size={18} color={colors.accentDeep} strokeWidth={2} />
            <AppText size={13} color={colors.accentDeep} style={styles.flex}>
              {soldOut.map((i) => i.name).join(', ')} {soldOut.length === 1 ? 'is' : 'are'} sold out. Remove {soldOut.length === 1 ? 'it' : 'them'} to continue.
            </AppText>
          </View>
        )}

        <View style={styles.list}>
          {items.map((item) => (
            <Line key={`${item.slug}|${item.sizeId ?? ''}`} item={item} onQty={(q) => setQty(item.slug, item.sizeId, q)} onRemove={() => remove(item.slug, item.sizeId)} />
          ))}
        </View>

        <View style={styles.summary}>
          <View style={styles.sumRow}>
            <AppText size={14} color={colors.textMuted}>
              Subtotal
            </AppText>
            <AppText weight="bold" size={16}>
              {formatPrice(subtotal)}
            </AppText>
          </View>
          <AppText size={12} color={colors.textMuted}>
            Delivery is added at checkout. Prices are confirmed again when you place your order.
          </AppText>
        </View>
      </ScrollView>

      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: soldOut.length > 0 }}
          disabled={soldOut.length > 0}
          onPress={() => router.push('/checkout')}
          style={({ pressed }) => [styles.cta, soldOut.length > 0 && styles.ctaOff, pressed && { opacity: 0.85 }]}
        >
          <AppText weight="bold" size={16} color={soldOut.length > 0 ? colors.textMuted : colors.canvas}>
            Checkout · {formatPrice(subtotal)}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function Line({ item, onQty, onRemove }: { item: ResolvedBagItem; onQty: (qty: number) => void; onRemove: () => void }) {
  return (
    <View style={styles.line}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${item.name}, view product`}
        onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })}
      >
        <ProductImage image={item.image} photo={item.photo} tint={item.tint} kind={item.kind} style={styles.thumb} iconSize={24} />
      </Pressable>
      <View style={styles.lineBody}>
        <AppText weight="bold" size={14} numberOfLines={2} style={styles.lineName}>
          {item.name}
        </AppText>
        {item.sizeLabel && (
          <AppText size={12} color={colors.textMuted}>
            {item.sizeLabel}
          </AppText>
        )}
        {item.warning && (
          <AppText size={11} color={colors.accentDeep}>
            {item.warning}
          </AppText>
        )}
        {item.inStock === false && (
          <AppText weight="bold" size={12} color={colors.accentDeep}>
            Sold out
          </AppText>
        )}
        <View style={styles.lineFoot}>
          <View style={styles.stepper}>
            <Step label={`Remove one ${item.name}`} onPress={() => onQty(item.qty - 1)} disabled={item.qty <= 1} symbol="−" />
            <AppText weight="bold" size={15} style={styles.qty} accessibilityLabel={`Quantity ${item.qty}`}>
              {item.qty}
            </AppText>
            <Step label={`Add one more ${item.name}`} onPress={() => onQty(item.qty + 1)} disabled={item.qty >= MAX_ITEM_QTY} symbol="+" />
          </View>
          <AppText weight="bold" size={15}>
            {formatPrice(item.lineTotal)}
          </AppText>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name} from bag`} onPress={onRemove} hitSlop={8} style={styles.remove}>
        <AppText weight="bold" size={16} color={colors.textMuted}>
          ✕
        </AppText>
      </Pressable>
    </View>
  );
}

function Step({ label, onPress, disabled, symbol }: { label: string; onPress: () => void; disabled: boolean; symbol: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={[styles.step, disabled && { opacity: 0.4 }]}
    >
      <AppText weight="bold" size={18}>
        {symbol}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 18,
  },
  flex: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: '#FDF0D6',
  },
  list: {
    gap: 14,
  },
  line: {
    flexDirection: 'row',
    gap: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radii.lg,
  },
  lineBody: {
    flex: 1,
    gap: 3,
  },
  lineName: {
    lineHeight: 18,
    paddingRight: 24,
  },
  lineFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
  },
  step: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    minWidth: 24,
    textAlign: 'center',
  },
  remove: {
    position: 'absolute',
    right: -4,
    top: -6,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    gap: 8,
    padding: 16,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
  },
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cta: {
    height: 54,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: {
    backgroundColor: colors.surfaceSunken,
  },
});
