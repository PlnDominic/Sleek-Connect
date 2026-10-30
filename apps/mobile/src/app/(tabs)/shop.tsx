import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, type TextInputInstance, View } from 'react-native';
import { colors, departmentIds, departmentLabels, isDepartment, radii, type Department, type Product } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ProductTile } from '@/components/ProductTile';
import { EmptyState, ErrorState, ProductGridSkeleton } from '@/components/States';
import { useScreenTop } from '@/components/ui';
import { getAllProducts, getCategories, searchSlugs } from '@/lib/catalog';
import { useQuery } from '@/lib/query';
import { useDebounced } from '@/lib/useDebounced';
import { fonts } from '@/theme/fonts';

type Sort = 'newest' | 'price-asc' | 'price-desc';
const sorts: { id: Sort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'price-asc', label: 'Price: low' },
  { id: 'price-desc', label: 'Price: high' },
];

export default function ShopScreen() {
  const top = useScreenTop();
  const params = useLocalSearchParams<{ department?: string; category?: string; focus?: string }>();
  const input = useRef<TextInputInstance>(null);
  const department: Department | undefined = isDepartment(params.department) ? params.department : undefined;
  const category = params.category;
  const [text, setText] = useState('');
  const [sort, setSort] = useState<Sort>('newest');

  // Arriving from the home page's search bar puts the cursor straight in the search field.
  useEffect(() => {
    if (params.focus) input.current?.focus();
  }, [params.focus]);

  // Searching waits for a short pause in typing, so each letter doesn't send a request.
  const query = useDebounced(text.trim(), 250);
  const searching = query.length >= 2;

  const all = useQuery('products:all', getAllProducts);
  const categories = useQuery('categories', getCategories);
  const matches = useQuery(searching ? `search:${query.toLowerCase()}` : null, () => searchSlugs(query), 5 * 60_000);

  const setFilters = useCallback((next: { department?: Department; category?: string }) => {
    router.setParams({ department: next.department ?? '', category: next.category ?? '' });
  }, []);

  const shown = useMemo(() => {
    let list: Product[] = all.data ?? [];
    if (searching && matches.data) {
      const rank = new Map(matches.data.map((slug, i) => [slug, i] as const));
      list = list.filter((p) => rank.has(p.slug)).sort((a, b) => rank.get(a.slug)! - rank.get(b.slug)!);
    } else if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
    if (department) list = list.filter((p) => p.department === department);
    if (category) list = list.filter((p) => p.category === category);
    return list;
  }, [all.data, matches.data, searching, sort, department, category]);

  const deptCategories = (categories.data ?? []).filter((c) => c.department === department);
  const waitingForSearch = searching && matches.loading;
  const failed = all.error && !all.data;

  const header = (
    <View style={styles.header}>
      <AppText weight="semibold" size={22} accessibilityRole="header">
        Shop
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
        {departmentIds.map((d) => (
          <Chip key={d} label={departmentLabels[d]} on={d === department} onPress={() => setFilters({ department: d })} />
        ))}
      </ScrollView>
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
          {all.loading || waitingForSearch ? 'Loading…' : `${shown.length} ${shown.length === 1 ? 'product' : 'products'}${searching ? ` for “${query}”` : ''}`}
        </AppText>
        {!searching && (
          <View style={styles.sorts} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
            {sorts.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: s.id === sort }}
                onPress={() => setSort(s.id)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <AppText weight={s.id === sort ? 'bold' : 'regular'} size={13} color={s.id === sort ? colors.accent : colors.textMuted}>
                  {s.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}
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
          <ErrorState onRetry={() => void all.refetch()} />
        ) : all.loading || waitingForSearch ? (
          <ProductGridSkeleton />
        ) : (
          <EmptyState
            icon="search"
            title="Nothing found"
            message={searching ? `No products match “${query}”. Try another word or clear the filters.` : 'There are no products here yet.'}
            action={department || category || text ? { label: 'Clear filters', onPress: () => { setText(''); setFilters({}); } } : undefined}
          />
        )
      }
      refreshing={all.refreshing}
      onRefresh={() => void all.refetch()}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={8}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

function Chip({ label, on, onPress, small }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
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
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSmall: {
    height: 34,
    paddingHorizontal: 13,
  },
  chipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  meta: {
    gap: 8,
  },
  sorts: {
    flexDirection: 'row',
    gap: 18,
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
