import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  ageBands,
  appCategories,
  appNewArrivals,
  colors,
  defaultDeliveryArea,
  city,
  radii,
  shadows,
} from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { ProductTile } from '@/components/ProductTile';
import { CountBadge, IconButton, SectionHeader, useScreenTop } from '@/components/ui';
import { fonts } from '@/theme/fonts';
import { images } from '@/theme/images';

const heroes = {
  beauty: {
    background: colors.ink,
    kicker: 'Weekend deal',
    title: 'Glow essentials for every routine',
    image: images.heroModel,
  },
  kids: {
    background: colors.teal,
    kicker: 'Bath time edit',
    title: 'Gentle care for new skin',
    image: images.babyWash,
  },
};

export default function HomeScreen() {
  const top = useScreenTop();
  const { count } = useBag();
  const [dept, setDept] = useState<'beauty' | 'kids'>('beauty'); // the app has these two departments for now
  const hero = heroes[dept];
  const products = appNewArrivals[dept];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top }]}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Deliver to ${defaultDeliveryArea}, ${city}. Change`}>
          <AppText size={12} color={colors.textMuted}>
            Deliver to
          </AppText>
          <View style={styles.row4}>
            <AppText weight="bold" size={16}>
              {defaultDeliveryArea}, {city}
            </AppText>
            <Icon name="chevronDown" size={16} strokeWidth={2} />
          </View>
        </Pressable>
        <View style={styles.row6}>
          <IconButton icon="bell" label="Notifications" />
          <IconButton icon="bag" label={`Bag, ${count} items`} onPress={() => router.push('/checkout')}>
            <CountBadge count={count} />
          </IconButton>
        </View>
      </View>

      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.textMuted} strokeWidth={2} />
        <TextInput
          accessibilityLabel="Search"
          placeholder="Search products or brands"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>

      <View style={styles.segment} accessibilityRole="tablist">
        {(['beauty', 'kids'] as const).map((d) => {
          const on = d === dept;
          return (
            <Pressable
              key={d}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setDept(d)}
              style={[styles.segmentButton, on && styles.segmentOn]}
            >
              <AppText weight="bold" size={14} color={on ? (d === 'kids' ? colors.teal : colors.accent) : colors.textMuted}>
                {d === 'kids' ? 'Baby & Kids' : 'Beauty'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.hero, { backgroundColor: hero.background }]}>
        <Image source={hero.image} style={styles.heroImage} contentFit="cover" contentPosition="top" />
        <AppText weight="bold" size={12} color={colors.canvas} style={styles.heroKicker}>
          {hero.kicker.toUpperCase()}
        </AppText>
        <AppText weight="bold" size={24} color={colors.canvas} style={styles.heroTitle}>
          {hero.title}
        </AppText>
        <Pressable accessibilityRole="button" style={styles.heroCta}>
          <AppText weight="bold" size={14}>
            Shop now
          </AppText>
        </Pressable>
      </View>

      <View style={styles.authentic}>
        <View style={styles.authenticIcon}>
          <Icon name="shieldCheck" size={20} color={colors.teal} strokeWidth={2} />
        </View>
        <View style={styles.flex}>
          <AppText weight="bold" size={14} color={colors.teal}>
            100% authentic, every order
          </AppText>
          <AppText size={13} color={colors.tealInk}>
            Batch and expiry checked before dispatch
          </AppText>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Categories" />
        <View style={styles.categories}>
          {appCategories[dept].map((c) => (
            <View key={c.id} style={styles.category}>
              <ProductImage image={c.image} tint={c.tint} kind={c.kind} style={styles.categoryImage} iconSize={26} />
              <AppText weight="semibold" size={12}>
                {c.name}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Shop by age" onSeeAll={() => router.push('/shop-by-age')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ageRow}>
          {ageBands.slice(0, 5).map((band) => (
            <Link key={band.id} href={{ pathname: '/shop-by-age', params: { band: band.id } }} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={`Shop ages ${band.label}`} style={styles.ageChip}>
                <AppText weight="bold" size={15} color={colors.teal}>
                  {band.label}
                </AppText>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <SectionHeader title="New arrivals" />
        <View style={styles.grid}>
          {products.map((p) => (
            <View key={p.slug} style={styles.gridCell}>
              <ProductTile product={p} />
            </View>
          ))}
        </View>
      </View>

      <Link href={{ pathname: '/product/[slug]', params: { slug: 'newborn-gift-hamper' } }} asChild>
        <Pressable accessibilityRole="link" style={styles.gift}>
          <View style={styles.giftIcon}>
            <Icon name="gift" size={24} color={colors.canvas} />
          </View>
          <View style={styles.flex}>
            <AppText weight="bold" size={15} color={colors.canvas}>
              Send a gift
            </AppText>
            <AppText size={13} color={colors.onDarkMuted}>
              Wrapped, with your note, no prices shown
            </AppText>
          </View>
          <Icon name="chevronRight" size={18} color={colors.canvas} strokeWidth={2} />
        </Pressable>
      </Link>
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
    gap: 22,
  },
  flex: {
    flex: 1,
  },
  row4: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  row6: {
    flexDirection: 'row',
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    height: 52,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  segment: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: {
    backgroundColor: colors.canvas,
    boxShadow: shadows.segment,
  },
  hero: {
    borderRadius: radii.xl,
    padding: 22,
    minHeight: 180,
    overflow: 'hidden',
    gap: 10,
  },
  heroImage: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '42%',
  },
  heroKicker: {
    letterSpacing: 0.96,
    opacity: 0.85,
  },
  heroTitle: {
    lineHeight: 28,
    maxWidth: 180,
  },
  heroCta: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: colors.canvas,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.xxl,
  },
  authentic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.tealSoft,
    borderRadius: radii.lg,
    padding: 14,
  },
  authenticIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.xxl,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: 14,
  },
  categories: {
    flexDirection: 'row',
    gap: 10,
  },
  category: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  categoryImage: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
  },
  ageRow: {
    gap: 8,
  },
  ageChip: {
    backgroundColor: colors.tealSoft,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
    columnGap: 14,
  },
  gridCell: {
    width: '47.6%',
    flexGrow: 1,
  },
  gift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.ink,
    borderRadius: radii.xl,
    padding: 20,
  },
  giftIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
