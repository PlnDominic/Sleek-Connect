import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ageBands,
  colors,
  formatPrice,
  productsForAgeBand,
  radii,
  type AgeBandId,
  type KidsFilter,
} from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { BackButton, TrustChip, useScreenTop } from '@/components/ui';

const filters: { id: KidsFilter | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'bath', label: 'Bath & skin' },
  { id: 'toys', label: 'Toys' },
  { id: 'clothing', label: 'Clothing' },
];

export default function ShopByAgeScreen() {
  const top = useScreenTop();
  const { add } = useBag();
  const params = useLocalSearchParams<{ band?: string }>();
  const initial = ageBands.find((b) => b.id === params.band)?.id ?? '1-2y';
  const [band, setBand] = useState<AgeBandId>(initial);
  const [filter, setFilter] = useState<KidsFilter | 'all'>('all');

  const current = ageBands.find((b) => b.id === band)!;
  const items = productsForAgeBand(band, filter === 'all' ? undefined : filter);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.header, { paddingTop: top }]}>
        <View style={styles.titleRow}>
          <BackButton fallback="/" />
          <AppText weight="semibold" size={22} accessibilityRole="header">
            Shop by age
          </AppText>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Age band" style={styles.bands}>
          {ageBands.map((b) => {
            const on = b.id === band;
            const color = on ? colors.canvas : colors.teal;
            return (
              <Pressable
                key={b.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setBand(b.id)}
                style={[styles.band, on && styles.bandOn]}
              >
                <AppText weight="bold" size={17} color={color}>
                  {b.label}
                </AppText>
                <AppText size={11} color={color}>
                  {b.stage}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.privacy}>
          <Icon name="lock" size={14} color={colors.tealInk} strokeWidth={2} />
          <AppText size={12} color={colors.tealInk}>
            Just a filter. We never store your child&apos;s details.
          </AppText>
        </View>
      </View>

      <View style={styles.body}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((f) => {
            const on = f.id === filter;
            return (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f.id)}
                style={[styles.filter, on && styles.filterOn]}
              >
                <AppText weight={on ? 'semibold' : 'regular'} size={13} color={on ? colors.canvas : colors.ink}>
                  {f.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
        <AppText size={13} color={colors.textMuted}>
          {items.length} {items.length === 1 ? 'product' : 'products'} for {current.label}
        </AppText>
        {items.map((p) => (
          <View key={p.slug} style={styles.item}>
            <Link href={{ pathname: '/product/[slug]', params: { slug: p.slug } }} asChild>
              <Pressable accessibilityRole="link" style={styles.itemLink}>
                <ProductImage image={p.image} tint={p.tint} kind={p.kind} style={styles.itemImage} />
                <View style={styles.itemText}>
                  <AppText weight="bold" size={15} style={styles.itemName}>
                    {p.name}
                  </AppText>
                  <TrustChip label={p.tag} compact />
                  <AppText weight="bold" size={15}>
                    {formatPrice(p.price)}
                  </AppText>
                </View>
              </Pressable>
            </Link>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add ${p.name} to bag`}
              onPress={() => add(p.slug, p.defaultSize)}
              style={styles.add}
            >
              <Icon name="plus" size={18} color={colors.canvas} strokeWidth={2} />
            </Pressable>
          </View>
        ))}
        {items.length === 0 && (
          <AppText size={14} color={colors.textMuted}>
            Nothing here yet for this age and filter.
          </AppText>
        )}
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
    paddingBottom: 32,
  },
  header: {
    backgroundColor: colors.tealSoft,
    paddingHorizontal: 20,
    paddingBottom: 22,
    gap: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bands: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  band: {
    width: '31.5%',
    flexGrow: 1,
    minHeight: 60,
    borderRadius: radii.lg,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bandOn: {
    backgroundColor: colors.teal,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  body: {
    paddingTop: 18,
    paddingHorizontal: 20,
    gap: 14,
  },
  filters: {
    gap: 8,
  },
  filter: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
  },
  filterOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  itemLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  itemImage: {
    width: 84,
    height: 84,
    borderRadius: radii.xl,
  },
  itemText: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    lineHeight: 20,
  },
  add: {
    width: 40,
    height: 40,
    borderRadius: radii.xxl,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
