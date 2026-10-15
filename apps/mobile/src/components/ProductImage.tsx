import { Image, type ImageContentPosition } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { kindIcon, type ImageKey, type ProductKind } from '@sleek/shared';
import { images } from '@/theme/images';
import { Icon } from './Icon';

interface ProductImageProps {
  image?: ImageKey;
  tint: string;
  kind: ProductKind;
  style?: StyleProp<ViewStyle>;
  position?: ImageContentPosition;
  iconSize?: number;
}

/** A product photo, or a tinted placeholder with the product's shape when no photo exists yet. */
export function ProductImage({ image, tint, kind, style, position = 'center', iconSize = 32 }: ProductImageProps) {
  return (
    <View style={[styles.frame, { backgroundColor: tint }, style]}>
      {image ? (
        <Image source={images[image]} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={position} />
      ) : (
        <View style={styles.placeholder}>
          <Icon name={kindIcon[kind]} size={iconSize} color="rgba(17,17,17,0.28)" strokeWidth={1.4} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
