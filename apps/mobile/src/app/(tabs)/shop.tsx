import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, products } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { ProductTile } from '@/components/ProductTile';
import { useScreenTop } from '@/components/ui';

export default function ShopScreen() {
  const top = useScreenTop();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top }]}>
      <AppText weight="semibold" size={22} accessibilityRole="header">
        Shop
      </AppText>
      <View style={styles.grid}>
        {products.map((p) => (
          <View key={p.slug} style={styles.cell}>
            <ProductTile product={p} />
          </View>
        ))}
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
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 18,
    columnGap: 14,
  },
  cell: {
    width: '47.6%',
    flexGrow: 1,
  },
});
