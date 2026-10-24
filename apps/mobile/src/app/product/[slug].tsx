import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { colors, formatPrice, getSize, isAvailable, radii, unitPrice, type IconName, type Product } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { BackButton, BottomBar, IconButton, TrustChip, useScreenTop } from '@/components/ui';
import { getProduct } from '@/lib/catalog';
import { useQuery } from '@/lib/query';
import { useSaved } from '@/lib/saved';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const top = useScreenTop();
  const { data: product, error, loading, refetch } = useQuery(slug ? `product:${slug}` : null, () => getProduct(slug));

  if (loading) {
    return (
      <View style={styles.screen}>
        <Skeleton style={styles.media} />
        <View style={[styles.mediaActions, { top }]}>
          <BackButton fallback="/" />
        </View>
        <View style={styles.body}>
          <Skeleton style={{ height: 14, width: '30%' }} />
          <Skeleton style={{ height: 26, width: '80%' }} />
          <Skeleton style={{ height: 44, width: '60%' }} />
        </View>
      </View>
    );
  }
  if (!product) {
    return (
      <View style={[styles.screen, { paddingTop: top, paddingHorizontal: 20 }]}>
        <BackButton fallback="/" />
        {error ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <EmptyState
            icon="box"
            title="This product isn't available"
            message="It may have been removed. Browse the shop to find something similar."
            action={{ label: 'Go to the shop', onPress: () => router.replace('/shop') }}
          />
        )}
      </View>
    );
  }
  return <ProductView product={product} />;
}

function ProductView({ product }: { product: Product }) {
  const top = useScreenTop();
  const { add, count } = useBag();
  const { slugs, toggle } = useSaved();
  const saved = slugs.includes(product.slug);
  // Start on the default size, or the first one that can be bought.
  const [sizeId, setSizeId] = useState(() => {
    const preferred = product.defaultSize;
    if (preferred && isAvailable(product, preferred)) return preferred;
    return product.sizes?.find((s) => s.inStock !== false)?.id ?? preferred;
  });
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2500);
    return () => clearTimeout(timer);
  }, [added]);

  const details = product.details;
  const highlights = details?.highlights ?? [product.tag];
  const sizeLabel = getSize(product, sizeId)?.label;
  const available = isAvailable(product, sizeId);
  const price = unitPrice(product, sizeId);
  const compliance = product.compliance;
  const batches = product.currentBatches ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Gallery product={product} />
        <View style={[styles.mediaActions, { top }]}>
          <BackButton fallback="/" />
          <IconButton
            icon={saved ? 'heartFilled' : 'heart'}
            label={saved ? 'Remove from saved items' : 'Save item'}
            background={colors.canvas}
            color={saved ? colors.accent : colors.ink}
            onPress={() => toggle(product.slug)}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.titleBlock}>
            {product.brand && (
              <AppText weight="bold" size={12} color={colors.textMuted} style={styles.brand}>
                {product.brand.toUpperCase()}
              </AppText>
            )}
            <AppText weight="semibold" size={22} style={styles.title} accessibilityRole="header">
              {product.name}
            </AppText>
            <View style={styles.chips}>
              {highlights.map((h) => (
                <TrustChip key={h} label={h} />
              ))}
            </View>
          </View>

          {product.warningLabel && (
            <View style={styles.warning} accessibilityRole="alert">
              <Icon name="alert" size={18} color={colors.accentDeep} strokeWidth={2} />
              <AppText weight="semibold" size={13} color={colors.accentDeep} style={styles.flex}>
                {product.warningLabel}
              </AppText>
            </View>
          )}

          {product.sizes && product.sizes.length > 1 && (
            <View style={styles.sizes} accessibilityRole="radiogroup" accessibilityLabel="Size">
              {product.sizes.map((s) => {
                const on = s.id === sizeId;
                const out = s.inStock === false;
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on, disabled: out }}
                    accessibilityLabel={out ? `${s.label}, sold out` : s.label}
                    disabled={out}
                    onPress={() => setSizeId(s.id)}
                    style={[styles.size, on && styles.sizeOn, out && styles.sizeOut]}
                  >
                    <AppText weight="semibold" size={14} color={on ? colors.canvas : out ? colors.textDisabled : colors.ink}>
                      {s.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.facts}>
            <Fact icon="shieldCheck" iconColor={colors.teal} title="Verified authentic">
              {compliance?.regulatoryReference
                ? `From an authorised distributor · FDA reg. ${compliance.regulatoryReference}`
                : 'From an authorised distributor'}
            </Fact>
            <Fact icon="calendar" title="Batch and expiry checked">
              Printed on your receipt for the unit we pack
            </Fact>
            <Fact icon="truck" title="Delivery across Accra" last>
              Tracked from our shelf to your door
            </Fact>
          </View>

          {(details?.description || product.summary) && (
            <Accordion title="About this product" initiallyOpen>
              {details?.description ?? product.summary}
            </Accordion>
          )}
          {compliance?.ingredients && <Accordion title="Ingredients">{compliance.ingredients}</Accordion>}
          {details?.howToUse && <Accordion title="How to use">{details.howToUse}</Accordion>}
          {details?.warnings && <Accordion title="Safety & warnings">{details.warnings}</Accordion>}
          {(batches.length > 0 || compliance?.periodAfterOpening || compliance?.countryOfOrigin) && (
            <Accordion title="Batch, origin & expiry">
              {[
                ...batches.map((b) => `Batch ${b.batch}${b.expiresOn ? `, expires ${b.expiresOn}` : ''}`),
                compliance?.periodAfterOpening ? `Period after opening: ${compliance.periodAfterOpening}` : null,
                compliance?.countryOfOrigin ? `Made in ${compliance.countryOfOrigin}` : null,
              ]
                .filter(Boolean)
                .join('\n')}
            </Accordion>
          )}
          <Accordion title="Returns" last>
            {product.returnable === false
              ? `Can't be returned once delivered, unless it arrives damaged, wrong or expired.${product.returnNote ? ` ${product.returnNote}` : ''}`
              : `Unopened and sealed items can be returned. Damaged or not genuine items are refunded in full.${product.returnNote ? ` ${product.returnNote}` : ''}`}
          </Accordion>
        </View>
      </ScrollView>

      <BottomBar style={styles.bar}>
        <View>
          {sizeLabel && (
            <AppText size={12} color={colors.textMuted}>
              {sizeLabel}
            </AppText>
          )}
          <View style={styles.priceRow}>
            <AppText weight="bold" size={22}>
              {formatPrice(price)}
            </AppText>
            {product.was !== undefined && !product.sizes?.length && (
              <AppText size={13} color={colors.textFaint} style={styles.was}>
                {formatPrice(product.was)}
              </AppText>
            )}
          </View>
        </View>
        {added ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/bag')} style={({ pressed }) => [styles.cta, styles.ctaAdded, pressed && { opacity: 0.85 }]}>
            <Icon name="bag" size={18} color={colors.canvas} strokeWidth={2} />
            <AppText weight="bold" size={16} color={colors.canvas} accessibilityLiveRegion="polite">
              Added · View bag ({count})
            </AppText>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !available }}
            disabled={!available}
            onPress={() => {
              add(product, sizeId);
              setAdded(true);
            }}
            style={({ pressed }) => [styles.cta, !available && styles.ctaOff, pressed && { opacity: 0.85 }]}
          >
            <Icon name="bag" size={18} color={available ? colors.canvas : colors.textMuted} strokeWidth={2} />
            <AppText weight="bold" size={16} color={available ? colors.canvas : colors.textMuted}>
              {available ? 'Add to bag' : 'Sold out'}
            </AppText>
          </Pressable>
        )}
      </BottomBar>
    </View>
  );
}

/** The product's photos, swiped sideways; a single picture when there is only one. */
function Gallery({ product }: { product: Product }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const photos = product.photos?.map((p) => p.url) ?? [];
  const slides = photos.length ? photos : [undefined];
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  return (
    <View style={[styles.media, { backgroundColor: product.tint }]}>
      <FlatList
        data={slides}
        keyExtractor={(item, i) => item ?? `slide-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        renderItem={({ item }) => (
          <ProductImage
            image={product.image}
            photo={item}
            tint={product.tint}
            kind={product.kind}
            iconSize={64}
            style={{ width, height: styles.media.height }}
            label={product.name}
          />
        )}
      />
      {slides.length > 1 && (
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

function Fact({
  icon,
  iconColor = colors.ink,
  title,
  children,
  last,
}: {
  icon: IconName;
  iconColor?: string;
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.fact, !last && styles.factDivider]}>
      <Icon name={icon} size={20} color={iconColor} strokeWidth={icon === 'shieldCheck' ? 2 : 1.8} />
      <View style={styles.flex}>
        <AppText weight="bold" size={14}>
          {title}
        </AppText>
        <AppText size={13} color={colors.textMuted}>
          {children}
        </AppText>
      </View>
    </View>
  );
}

function Accordion({ title, children, initiallyOpen, last }: { title: string; children: ReactNode; initiallyOpen?: boolean; last?: boolean }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <View style={[styles.accordion, !last && styles.factDivider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.accordionHeader}
      >
        <AppText weight="bold" size={15}>
          {title}
        </AppText>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} strokeWidth={2} />
      </Pressable>
      {open && (
        <AppText size={13} color={colors.textMuted} style={styles.accordionBody}>
          {children}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    paddingBottom: 130,
  },
  flex: {
    flex: 1,
  },
  media: {
    height: 340,
  },
  mediaActions: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dots: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.tealMuted,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.teal,
  },
  body: {
    padding: 20,
    gap: 16,
  },
  titleBlock: {
    gap: 6,
  },
  brand: {
    letterSpacing: 0.96,
  },
  title: {
    lineHeight: 27,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: '#FDF0D6',
  },
  sizes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  size: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
  },
  sizeOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  sizeOut: {
    backgroundColor: colors.surface,
    borderStyle: 'dashed',
  },
  facts: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  factDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  accordion: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  accordionBody: {
    marginTop: 6,
    lineHeight: 21,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  was: {
    textDecorationLine: 'line-through',
  },
  cta: {
    flex: 1,
    height: 54,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaAdded: {
    backgroundColor: colors.ink,
  },
  ctaOff: {
    backgroundColor: colors.surfaceSunken,
  },
});
