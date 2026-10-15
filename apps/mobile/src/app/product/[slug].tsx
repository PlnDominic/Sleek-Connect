import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  colors,
  defaultDeliveryArea,
  formatPrice,
  getProduct,
  getSize,
  pending,
  radii,
  unitPrice,
  type IconName,
} from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { BackButton, BottomBar, IconButton, TrustChip, useScreenTop } from '@/components/ui';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const product = getProduct(slug);
  const top = useScreenTop();
  const { add } = useBag();
  const [sizeId, setSizeId] = useState(product?.defaultSize);

  if (!product) return <Redirect href="/" />;

  const details = product.details;
  const highlights = details?.highlights ?? [product.tag];
  const sizeLabel = getSize(product, sizeId)?.label;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.media, { backgroundColor: product.tint }]}>
          <ProductImage image={product.image} tint={product.tint} kind={product.kind} style={StyleSheet.absoluteFill} iconSize={64} />
          <View style={[styles.mediaActions, { top }]}>
            <BackButton fallback="/" />
            <IconButton icon="heart" label="Save item" background={colors.canvas} />
          </View>
          <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
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

          {product.sizes && product.sizes.length > 1 && (
            <View style={styles.sizes} accessibilityRole="radiogroup" accessibilityLabel="Size">
              {product.sizes.map((s) => {
                const on = s.id === sizeId;
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setSizeId(s.id)}
                    style={[styles.size, on && styles.sizeOn]}
                  >
                    <AppText weight="semibold" size={14} color={on ? colors.canvas : colors.ink}>
                      {s.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.facts}>
            <Fact icon="shieldCheck" iconColor={colors.teal} title="Verified authentic">
              From an authorised distributor · FDA reg. {pending.fdaRegistration}
            </Fact>
            <Fact icon="calendar" title={`${pending.batchNumber} · Expires ${pending.expiryDate}`}>
              Printed on your receipt for the unit we pack
            </Fact>
            <Fact icon="truck" title={`Delivery to ${defaultDeliveryArea}`} last>
              {pending.deliveryDays} working days · tracked
            </Fact>
          </View>

          <Accordion title="Ingredients" initiallyOpen>
            {pending.ingredientList}
          </Accordion>
          <Accordion title="Safety & warnings">{details?.warnings ?? '[Warnings as printed on the pack]'}</Accordion>
          <Accordion title="Returns" last>
            Unopened within {pending.returnWindowDays} days.
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
          <AppText weight="bold" size={22}>
            {formatPrice(unitPrice(product, sizeId))}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            add(product.slug, sizeId);
            router.push('/checkout');
          }}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          <Icon name="bag" size={18} color={colors.canvas} strokeWidth={2} />
          <AppText weight="bold" size={16} color={colors.canvas}>
            Add to bag
          </AppText>
        </Pressable>
      </BottomBar>
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
    paddingBottom: 120,
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
  sizes: {
    flexDirection: 'row',
    gap: 8,
  },
  size: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
  },
  sizeOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
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
    paddingVertical: 8,
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
});
