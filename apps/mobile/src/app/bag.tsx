import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { formatPrice, radii } from '@sleek/shared';
import { MAX_ITEM_QTY, useBag, type ResolvedBagItem } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState } from '@/components/States';
import { BackButton, BottomBar } from '@/components/ui';
import { getDeliveryConfig } from '@/lib/checkout';
import { bagLineChanges, refreshBagLines } from '@/lib/bag-checkout';
import { Notice } from '@/components/Form';
import { useQuery } from '@/lib/query';
import { useColors, useStyles, type Palette } from '@/theme/theme';

/** Right-hand drawer over a dimmed page; tapping the dimmed part closes it. */
export default function BagScreen() {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  // Inside a transparent modal the safe-area inset can read 0, so fall back to the status bar height.
  const statusBar = Math.max(insets.top, Constants.statusBarHeight ?? 0);
  return (
    // The whole overlay starts below the status bar, so neither the dim layer nor the drawer covers the time and signal.
    <View style={[styles.overlay, { paddingTop: statusBar }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close bag" onPress={() => router.back()} style={styles.backdrop} />
      <View style={styles.panel}>
        <BagPanel />
      </View>
    </View>
  );
}

function BagPanel() {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const top = 16; // the drawer already starts below the status bar
  const { items, count, subtotal, setQty, remove, replaceDetails } = useBag();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string>();
  const checkingRef = useRef(false);
  const soldOut = items.filter((i) => i.inStock === false);
  const delivery = useQuery('delivery-config', getDeliveryConfig, 5 * 60_000).data;
  // Only worth showing when some delivery option really becomes free at the threshold.
  const threshold = delivery?.options.some((o) => o.freeEligible) ? delivery.freeThreshold : null;

  async function goToCheckout() {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setMessage(undefined);
    try {
      const latest = await refreshBagLines(items);
      const changes = bagLineChanges(items, latest);
      replaceDetails(latest);
      if (changes.length) {
        setMessage(changes.map((line) => line.unavailable ? `${line.name} is unavailable.` : `${line.name} is now ${formatPrice(line.price)}.`).join('\n'));
      } else if (!latest.some((item) => item.inStock === false)) {
        router.push('/checkout');
      }
    } catch {
      setMessage('We couldn’t check current prices and stock. Check your connection and try again.');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  if (items.length === 0) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top }]}>
        <View style={styles.titleRow}>
          <BackButton fallback="/" label="Close bag" />
          <AppText weight="semibold" size={22} accessibilityRole="header">
            Your bag
          </AppText>
        </View>
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
          <BackButton fallback="/" label="Close bag" />
          <AppText weight="semibold" size={22} accessibilityRole="header" style={styles.flex}>
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
        {message && <Notice>{message}</Notice>}

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
          {threshold !== null && threshold > 0 && (
            <View style={styles.free}>
              <AppText weight="semibold" size={13} color={subtotal >= threshold ? colors.teal : colors.ink}>
                {subtotal >= threshold ? 'You’ve got free delivery' : `Add ${formatPrice(threshold - subtotal)} more for free delivery`}
              </AppText>
              <View style={styles.freeTrack}>
                <View style={[styles.freeFill, { width: `${Math.min(100, (subtotal / threshold) * 100)}%` }]} />
              </View>
            </View>
          )}
          <AppText size={12} color={colors.textMuted}>
            Delivery is added at checkout. Prices are confirmed again when you place your order.
          </AppText>
        </View>
      </ScrollView>

      <BottomBar>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: checking, busy: checking }}
          disabled={checking}
          onPress={() => void goToCheckout()}
          style={({ pressed }) => [styles.cta, checking && styles.ctaOff, pressed && { opacity: 0.85 }]}
        >
          <AppText weight="bold" size={16} color={checking ? colors.textMuted : colors.canvas}>
            {checking ? 'Checking your bag…' : `Checkout · ${formatPrice(subtotal)}`}
          </AppText>
        </Pressable>
      </BottomBar>
    </View>
  );
}

function Line({ item, onQty, onRemove }: { item: ResolvedBagItem; onQty: (qty: number) => void; onRemove: () => void }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
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
  const styles = useStyles(makeStyles);
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

const makeStyles = (colors: Palette) => StyleSheet.create({
  free: { gap: 6 },
  freeTrack: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  freeFill: { height: 6, borderRadius: 3, backgroundColor: colors.teal },
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  panel: {
    width: '88%',
    maxWidth: 440,
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 130,
    gap: 18,
  },
  flex: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.warnSoft,
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
