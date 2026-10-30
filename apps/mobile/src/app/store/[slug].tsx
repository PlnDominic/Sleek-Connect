import { useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { colors, radii } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { ProductImage } from '@/components/ProductImage';
import { ProductTile } from '@/components/ProductTile';
import { EmptyState, ErrorState, ProductGridSkeleton } from '@/components/States';
import { BackButton, useScreenTop } from '@/components/ui';
import { getStorefront } from '@/lib/catalog';
import { useQuery } from '@/lib/query';

/** A vendor's store: who they are and what they have on sale. Opened from "Sold by" on a product. */
export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const top = useScreenTop();
  const { data: store, error, loading, refetch } = useQuery(slug ? `store:${slug}` : null, () => getStorefront(slug));

  const header = (
    <View style={styles.header}>
      <BackButton fallback="/shop" />
      {store && (
        <View style={styles.identity}>
          {store.logo ? (
            <ProductImage photo={store.logo} tint={colors.tealSoft} kind="gift" style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.initial]}>
              <AppText weight="bold" size={26} color={colors.canvas}>
                {store.name.slice(0, 1).toUpperCase()}
              </AppText>
            </View>
          )}
          <View style={styles.flex}>
            <AppText weight="semibold" size={22} accessibilityRole="header">
              {store.name}
            </AppText>
            {store.tagline && (
              <AppText size={14} color={colors.textMuted}>
                {store.tagline}
              </AppText>
            )}
            {store.rating.count > 0 && (
              <AppText size={13} color={colors.textMuted}>
                {store.rating.average.toFixed(1)} ★ · {store.rating.count} review{store.rating.count === 1 ? '' : 's'}
              </AppText>
            )}
          </View>
        </View>
      )}
      {store?.description ? (
        <AppText size={14} color={colors.textSubtle}>
          {store.description}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: top }]}
      data={store?.products ?? []}
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
        loading ? (
          <ProductGridSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <EmptyState icon="store" title={store ? 'Nothing on sale yet' : 'This store isn’t open'} message="Check back soon, or browse the rest of the shop." />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  header: { gap: 14, paddingBottom: 14 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flex: { flex: 1, gap: 2 },
  logo: { width: 64, height: 64, borderRadius: radii.lg, overflow: 'hidden' },
  initial: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  row: { gap: 12 },
  cell: { flex: 1, marginBottom: 16 },
});
