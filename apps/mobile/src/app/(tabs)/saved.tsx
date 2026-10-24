import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { colors } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { ProductTile } from '@/components/ProductTile';
import { EmptyState, ErrorState, ProductGridSkeleton } from '@/components/States';
import { useScreenTop } from '@/components/ui';
import { getAllProducts } from '@/lib/catalog';
import { useQuery } from '@/lib/query';
import { useSaved } from '@/lib/saved';

export default function SavedScreen() {
  const top = useScreenTop();
  const { slugs } = useSaved();
  const all = useQuery('products:all', getAllProducts);
  const bySlug = new Map((all.data ?? []).map((p) => [p.slug, p]));
  // Newest saved first; items that are no longer in the shop are left out.
  const items = slugs.flatMap((slug) => bySlug.get(slug) ?? []);
  const waiting = slugs.length > 0 && all.loading;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: top }]}
      data={waiting ? [] : items}
      keyExtractor={(p) => p.slug}
      numColumns={2}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <View style={styles.cell}>
          <ProductTile product={item} />
        </View>
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <AppText weight="semibold" size={22} accessibilityRole="header">
            Saved
          </AppText>
          {items.length > 0 && (
            <AppText size={13} color={colors.textMuted}>
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </AppText>
          )}
        </View>
      }
      ListEmptyComponent={
        waiting ? (
          <ProductGridSkeleton count={4} />
        ) : all.error && slugs.length > 0 && !all.data ? (
          <ErrorState onRetry={() => void all.refetch()} />
        ) : (
          <EmptyState
            icon="heart"
            title="Nothing saved yet"
            message="Tap the heart on any product to keep it here for later."
            action={{ label: 'Browse the shop', onPress: () => router.push('/shop') }}
          />
        )
      }
      refreshing={all.refreshing}
      onRefresh={() => void all.refetch()}
      initialNumToRender={8}
      windowSize={7}
    />
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
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 16,
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
