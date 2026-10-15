import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, formatPrice, radii, type Product } from '@sleek/shared';
import { AppText } from './AppText';
import { ProductImage } from './ProductImage';

/** Two-up product tile used in the home and shop grids. */
export function ProductTile({ product }: { product: Product }) {
  const tagColor = product.department === 'kids' ? colors.teal : colors.accentDeep;
  return (
    <Link href={{ pathname: '/product/[slug]', params: { slug: product.slug } }} asChild>
      <Pressable accessibilityRole="link" style={styles.tile}>
        <View>
          <ProductImage image={product.image} tint={product.tint} kind={product.kind} style={styles.image} />
          {product.badge ? (
            <View style={styles.badge}>
              <AppText weight="bold" size={11} color={colors.canvas}>
                {product.badge}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText weight="semibold" size={11} color={tagColor}>
          {product.tag}
        </AppText>
        <AppText weight="bold" size={14} style={styles.name}>
          {product.name}
        </AppText>
        <AppText weight="bold" size={15}>
          {formatPrice(product.price)}
        </AppText>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    gap: 6,
  },
  image: {
    aspectRatio: 1,
    borderRadius: radii.xl,
  },
  badge: {
    position: 'absolute',
    left: 10,
    top: 10,
    backgroundColor: colors.accent,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
  },
  name: {
    lineHeight: 18,
  },
});
