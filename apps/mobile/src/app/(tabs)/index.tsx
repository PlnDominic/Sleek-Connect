import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { colors, departmentIds, departmentLabels, radii, type Department } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { ProductTile } from '@/components/ProductTile';
import { ErrorState, ProductGridSkeleton, Skeleton } from '@/components/States';
import { CountBadge, IconButton, SectionHeader, useScreenTop } from '@/components/ui';
import { getAgeBands, getAllProducts, getCategories, getHome, type Banner } from '@/lib/catalog';
import { appHref } from '@/lib/links';
import { useQuery } from '@/lib/query';
import { images } from '@/theme/images';

/** Promo card colours for each banner theme. */
const themes = {
  light: { background: colors.surfaceHero, text: colors.ink },
  sale: { background: colors.ink, text: colors.canvas },
  gift: { background: colors.blush, text: colors.ink },
} as const;

export default function HomeScreen() {
  const top = useScreenTop();
  const { count } = useBag();
  const [dept, setDept] = useState<Department>('beauty');
  const home = useQuery('home', getHome);
  const all = useQuery('products:all', getAllProducts);
  const categories = useQuery('categories', getCategories);
  const bands = useQuery('age-bands', getAgeBands);

  const deptCategories = (categories.data ?? []).filter((c) => c.department === dept);
  const arrivals = (all.data ?? []).filter((p) => p.department === dept).slice(0, 6);
  const failed = (home.error && !home.data) || (all.error && !all.data);

  const openShop = (params: { department?: Department; category?: string } = {}) =>
    router.push({ pathname: '/shop', params: { department: params.department ?? '', category: params.category ?? '' } });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: top }]}
      refreshControl={
        <RefreshControl
          refreshing={home.refreshing || all.refreshing}
          onRefresh={() => {
            void home.refetch();
            void all.refetch();
            void categories.refetch();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.topRow}>
        <AppText weight="extrabold" size={20} accessibilityRole="header">
          Sleek <AppText weight="extrabold" size={20} color={colors.accent}>Connect</AppText> Store
        </AppText>
        <IconButton icon="bag" label={`Bag, ${count} ${count === 1 ? 'item' : 'items'}`} onPress={() => router.push('/bag')}>
          <CountBadge count={count} />
        </IconButton>
      </View>

      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Search products or brands"
        onPress={() => router.push({ pathname: '/shop', params: { focus: String(Date.now()) } })}
        style={styles.search}
      >
        <Icon name="search" size={18} color={colors.textMuted} strokeWidth={2} />
        <AppText size={15} color={colors.textMuted}>
          Search products or brands
        </AppText>
      </Pressable>

      {home.loading ? <Skeleton style={styles.heroSkeleton} /> : home.data?.hero ? <HeroCard banner={home.data.hero} /> : null}

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

      {failed ? (
        <ErrorState
          onRetry={() => {
            void home.refetch();
            void all.refetch();
            void categories.refetch();
          }}
        />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.depts} accessibilityRole="tablist">
            {departmentIds.map((d) => {
              const on = d === dept;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => setDept(d)}
                  style={[styles.dept, on && styles.deptOn]}
                >
                  <AppText weight="bold" size={14} color={on ? colors.canvas : colors.ink}>
                    {departmentLabels[d]}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          {deptCategories.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Categories" onSeeAll={() => openShop({ department: dept })} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
                {deptCategories.map((c) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="link"
                    accessibilityLabel={c.name}
                    onPress={() => openShop({ department: dept, category: c.id })}
                    style={styles.category}
                  >
                    <ProductImage image={c.image} tint={c.tint} kind={c.kind} style={styles.categoryImage} iconSize={26} />
                    <AppText weight="semibold" size={12} numberOfLines={2} style={styles.categoryName}>
                      {c.name}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {dept === 'kids' && (bands.data?.length ?? 0) > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Shop by age" onSeeAll={() => router.push('/shop-by-age')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ageRow}>
                {bands.data!.map((band) => (
                  <Pressable
                    key={band.id}
                    accessibilityRole="link"
                    accessibilityLabel={`Shop ages ${band.label}`}
                    onPress={() => router.push({ pathname: '/shop-by-age', params: { band: band.id } })}
                    style={styles.ageChip}
                  >
                    <AppText weight="bold" size={15} color={colors.teal}>
                      {band.label}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.section}>
            <SectionHeader title="New arrivals" onSeeAll={arrivals.length ? () => openShop({ department: dept }) : undefined} />
            {all.loading ? (
              <ProductGridSkeleton count={4} />
            ) : arrivals.length === 0 ? (
              <AppText size={14} color={colors.textMuted}>
                Nothing in {departmentLabels[dept]} yet. Check back soon.
              </AppText>
            ) : (
              <View style={styles.grid}>
                {arrivals.map((p) => (
                  <View key={p.slug} style={styles.gridCell}>
                    <ProductTile product={p} />
                  </View>
                ))}
              </View>
            )}
          </View>

          {(home.data?.promos ?? []).map((promo) => (
            <PromoCard key={promo.id} banner={promo} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

/** The main banner, as set in Admin → Content. */
function HeroCard({ banner }: { banner: Banner }) {
  const dark = banner.theme === 'sale';
  return (
    <View style={[styles.hero, { backgroundColor: dark ? colors.ink : colors.teal }]}>
      {banner.image && <Image source={images[banner.image]} style={styles.heroImage} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" />}
      {banner.kicker && (
        <AppText weight="bold" size={12} color={colors.canvas} style={styles.heroKicker}>
          {banner.kicker.toUpperCase()}
        </AppText>
      )}
      <AppText weight="bold" size={24} color={colors.canvas} style={styles.heroTitle} accessibilityRole="header">
        {banner.title.replace(/\n/g, ' ')}
      </AppText>
      {banner.ctaLabel && (
        <Pressable accessibilityRole="button" onPress={() => router.push(appHref(banner.ctaHref))} style={styles.heroCta}>
          <AppText weight="bold" size={14} color={colors.ink}>
            {banner.ctaLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

function PromoCard({ banner }: { banner: Banner }) {
  const theme = themes[banner.theme];
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={banner.title.replace(/\n/g, ' ')}
      onPress={() => router.push(appHref(banner.ctaHref))}
      style={[styles.promo, { backgroundColor: theme.background }]}
    >
      <View style={styles.flex}>
        {banner.kicker && (
          <AppText weight="bold" size={11} color={theme.text} style={styles.heroKicker}>
            {banner.kicker.toUpperCase()}
          </AppText>
        )}
        <AppText weight="bold" size={18} color={theme.text}>
          {banner.title.replace(/\n/g, ' ')}
        </AppText>
        {banner.body && (
          <AppText size={13} color={theme.text} style={styles.promoBody}>
            {banner.body}
          </AppText>
        )}
      </View>
      <Icon name="chevronRight" size={20} color={theme.text} strokeWidth={2} />
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
    paddingBottom: 28,
    gap: 22,
  },
  flex: {
    flex: 1,
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
  depts: {
    gap: 8,
    paddingRight: 20,
  },
  dept: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deptOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  heroSkeleton: {
    height: 190,
    borderRadius: radii.xl,
  },
  hero: {
    borderRadius: radii.xl,
    padding: 22,
    minHeight: 190,
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
    maxWidth: 190,
  },
  heroCta: {
    alignSelf: 'flex-start',
    marginTop: 6,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    paddingHorizontal: 18,
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
    gap: 14,
    paddingRight: 20,
  },
  category: {
    width: 78,
    alignItems: 'center',
    gap: 8,
  },
  categoryImage: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
  },
  categoryName: {
    textAlign: 'center',
  },
  ageRow: {
    gap: 8,
  },
  ageChip: {
    backgroundColor: colors.tealSoft,
    borderRadius: radii.lg,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 18,
    columnGap: 14,
  },
  gridCell: {
    width: '47.6%',
    flexGrow: 1,
  },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radii.xl,
    padding: 20,
  },
  promoBody: {
    marginTop: 4,
    opacity: 0.85,
  },
});
