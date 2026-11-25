import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, type TextInputInstance, View } from 'react-native';
import { departmentIds, departmentLabels, isDepartment, radii, type Department, type Product } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductTile } from '@/components/ProductTile';
import { EmptyState, ProductGridSkeleton } from '@/components/States';
import { useScreenTop } from '@/components/ui';
import { getAllProducts, getCategories, searchSlugs } from '@/lib/catalog';
import { useQuery } from '@/lib/query';
import { useDebounced } from '@/lib/useDebounced';
import { fonts } from '@/theme/fonts';
import { useColors, useStyles, type Palette } from '@/theme/theme';

type Sort = 'newest' | 'price-asc' | 'price-desc' | 'saving' | 'rating' | 'popular';
type SearchSort = Sort | 'relevance';
const sorts: { id: Sort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'price-asc', label: 'Price: low' },
  { id: 'price-desc', label: 'Price: high' },
  { id: 'popular', label: 'Best selling' },
  { id: 'rating', label: 'Top rated' },
  { id: 'saving', label: 'Biggest saving' },
];
const relevance = { id: 'relevance', label: 'Relevance' } as const;

/** The share taken off the old price (0 when the product isn't discounted). */
const saving = (p: { price: number; was?: number }) => (p.was !== undefined && p.was > p.price ? (p.was - p.price) / p.was : 0);

type ShopParams = { department?: string; category?: string; focus?: string; sort?: string; sale?: string; entry?: string };

export default function ShopScreen() {
  const params = useLocalSearchParams<ShopParams>();
  return <ShopResults key={params.entry} params={params} />;
}

function ShopResults({ params }: { params: ShopParams }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const top = useScreenTop();
  const input = useRef<TextInputInstance>(null);
  const department: Department | undefined = isDepartment(params.department) ? params.department : undefined;
  const category = params.category;
  const sale = params.sale === '1';
  const [text, setText] = useState('');
  const [searchSort, setSearchSort] = useState<SearchSort>('relevance');

  // Arriving from the home page's search bar puts the cursor straight in the search field.
  useEffect(() => {
    if (params.focus) input.current?.focus();
  }, [params.focus]);

  // Searching waits for a short pause in typing, so each letter doesn't send a request.
  const query = useDebounced(text.trim(), 250);
  const searching = query.length >= 2;
  const sort = searching ? searchSort : sorts.find((option) => option.id === params.sort)?.id ?? 'newest';

  const all = useQuery('products:all', getAllProducts);
  const categories = useQuery('categories', getCategories);
  const matches = useQuery(searching ? `search:${query.toLowerCase()}` : null, () => searchSlugs(query), 5 * 60_000);

  const setFilters = useCallback((next: { department?: Department; category?: string }) => {
    router.setParams({ department: next.department ?? '', category: next.category ?? '' });
  }, []);

  const shown = useMemo(() => {
    let list: Product[] = (all.data ?? []).filter((p) =>
      (!department || p.department === department) && (!category || p.category === category) && (!sale || saving(p) > 0),
    );
    if (searching) {
      if (!matches.data) return [];
      const rank = new Map(matches.data.map((slug, i) => [slug, i] as const));
      list = list.filter((p) => rank.has(p.slug));
      if (sort === 'relevance') list.sort((a, b) => rank.get(a.slug)! - rank.get(b.slug)!);
    }
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (sort === 'popular') list.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    else if (sort === 'rating') list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    else if (sort === 'saving') list.sort((a, b) => saving(b) - saving(a));
    else if (sort === 'newest') list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return list;
  }, [all.data, matches.data, searching, sort, department, category, sale]);

  // A department shows once it has a category, so a new one doesn't appear empty.
  const shownDepartments = categories.data ? departmentIds.filter((d) => categories.data?.some((c) => c.department === d)) : departmentIds;
  const deptCategories = (categories.data ?? []).filter((c) => c.department === department);
  const waitingForSearch = searching && matches.loading;
  const searchFailed = searching && Boolean(matches.error) && !matches.data;
  const catalogueFailed = Boolean(all.error) && !all.data;
  const failed = catalogueFailed || searchFailed;

  const header = (
    <View style={styles.header}>
      <AppText weight="semibold" size={22} accessibilityRole="header">
        {sale ? 'Deals' : 'Shop'}
      </AppText>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.textMuted} strokeWidth={2} />
        <TextInput
          ref={input}
          accessibilityLabel="Search products"
          placeholder="Search products or brands"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {text.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setText('')} hitSlop={10}>
            <AppText weight="bold" size={16} color={colors.textMuted}>
              ✕
            </AppText>
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        <Chip label="All" on={!department} onPress={() => setFilters({})} />
        {shownDepartments.map((d) => (
          <Chip key={d} label={departmentLabels[d]} on={d === department} onPress={() => setFilters({ department: d })} />
        ))}
      </ScrollView>
      <View style={styles.deals}>
        <Chip label="Deals only" small on={sale} onPress={() => router.setParams({ sale: sale ? '' : '1', sort: sale ? '' : 'saving' })} />
      </View>
      {department && deptCategories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          <Chip small label={`All ${departmentLabels[department]}`} on={!category} onPress={() => setFilters({ department })} />
          {deptCategories.map((c) => (
            <Chip key={c.id} small label={c.name} on={c.id === category} onPress={() => setFilters({ department, category: c.id })} />
          ))}
        </ScrollView>
      )}

      <View style={styles.meta}>
        <AppText size={13} color={colors.textMuted} accessibilityLiveRegion="polite">
          {failed ? '' : all.loading || waitingForSearch ? 'Loading…' : `${shown.length} ${shown.length === 1 ? 'product' : 'products'}${searching ? ` for “${query}”` : ''}`}
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.sorts} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
            {(searching ? [relevance, ...sorts] : sorts).map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: s.id === sort }}
                onPress={() => searching ? setSearchSort(s.id) : router.setParams({ sort: s.id })}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <AppText weight={s.id === sort ? 'bold' : 'regular'} size={13} color={s.id === sort ? colors.accent : colors.textMuted}>
                  {s.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: top }]}
      data={failed || all.loading || waitingForSearch ? [] : shown}
      keyExtractor={(p) => p.slug}
      numColumns={2}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <View style={styles.cell}>
          <ProductTile product={item} />
        </View>
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={
        failed ? (
          <EmptyState
            icon="alert"
            title={searchFailed ? 'Search is temporarily unavailable' : 'Couldn’t load the shop'}
            message="Check your connection and try again."
            action={{ label: 'Try again', onPress: () => {
              if (catalogueFailed) void all.refetch();
              if (searchFailed) void matches.refetch();
            } }}
          />
        ) : all.loading || waitingForSearch ? (
          <ProductGridSkeleton />
        ) : (
          <EmptyState
            icon="search"
            title="Nothing found"
            message={searching ? `No products match “${query}”. Try another word or clear the filters.` : sale ? 'There are no deals in this selection right now.' : 'There are no products here yet.'}
            action={department || category || text || sale ? { label: 'Clear search and filters', onPress: () => {
              setText('');
              router.setParams({ department: '', category: '', sale: '', sort: '' });
            } } : undefined}
          />
        )
      }
      refreshing={all.refreshing || matches.refreshing}
      onRefresh={() => {
        void all.refetch();
        if (searching) void matches.refetch();
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={8}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

function Chip({ label, on, onPress, small }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, small && styles.chipSmall, on && styles.chipOn]}
    >
      <AppText weight={on ? 'bold' : 'semibold'} size={small ? 12 : 13} color={on ? colors.canvas : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  header: {
    gap: 14,
    paddingBottom: 14,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
    outlineWidth: 0,
  },
  chips: {
    gap: 8,
    paddingRight: 20,
  },
  chip: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSmall: {
    paddingHorizontal: 13,
  },
  chipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  meta: {
    gap: 8,
  },
  deals: {
    alignSelf: 'flex-start',
  },
  sorts: {
    flexDirection: 'row',
    gap: 18,
    paddingVertical: 8,
  },
  row: {
    columnGap: 14,
    marginBottom: 18,
  },
  cell: {
    flex: 1,
    maxWidth: '50%',
  },
});
