import { Link } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, formatPrice, radii, type Product } from '@sleek/shared';
import { useSaved } from '@/lib/saved';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';

/** Two-up product tile used in the home, shop and saved grids. */
export const ProductTile = memo(function ProductTile({ product }: { product: Product }) {
  const { slugs, toggle } = useSaved();
  const saved = slugs.includes(product.slug);
  const soldOut = product.inStock === false;
  const tagColor = product.department === 'kids' ? colors.teal : colors.accentDeep;
  return (
    <View style={styles.tile}>
      <Link href={{ pathname: '/product/[slug]', params: { slug: product.slug } }} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${product.name}, ${formatPrice(product.price)}${soldOut ? ', sold out' : ''}`}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <View>
            <ProductImage image={product.image} photo={product.photos?.[0]?.url} tint={product.tint} kind={product.kind} style={styles.image} />
            {soldOut ? (
              <View style={styles.soldOut}>
                <AppText weight="bold" size={12}>
                  Sold out
                </AppText>
              </View>
            ) : product.badge ? (
              <View style={styles.badge}>
                <AppText weight="bold" size={11} color={colors.canvas}>
                  {product.badge}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText weight="semibold" size={11} color={tagColor} numberOfLines={1}>
            {product.tag}
          </AppText>
          <AppText weight="bold" size={14} style={styles.name} numberOfLines={2}>
            {product.name}
          </AppText>
          <View style={styles.prices}>
            <AppText weight="bold" size={15}>
              {formatPrice(product.price)}
            </AppText>
            {product.was !== undefined && (
              <AppText size={12} color={colors.textFaint} style={styles.was}>
                {formatPrice(product.was)}
              </AppText>
            )}
          </View>
        </Pressable>
      </Link>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saved ? `Remove ${product.name} from saved items` : `Save ${product.name}`}
        accessibilityState={{ selected: saved }}
        onPress={() => toggle(product.slug)}
        hitSlop={6}
        style={styles.heart}
      >
        <Icon name={saved ? 'heartFilled' : 'heart'} size={18} color={saved ? colors.accent : colors.ink} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
  },
  link: {
    gap: 6,
  },
  pressed: {
    opacity: 0.75,
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
  soldOut: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    backgroundColor: colors.canvas,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
  },
  name: {
    lineHeight: 18,
  },
  prices: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  was: {
    textDecorationLine: 'line-through',
  },
  heart: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
