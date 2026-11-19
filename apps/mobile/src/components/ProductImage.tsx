import { Image, type ImageContentPosition } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { kindIcon, type ImageKey, type ProductKind } from '@sleek/shared';
import { images } from '@/theme/images';
import { Icon } from './Icon';

interface ProductImageProps {
  image?: ImageKey;
  /** An uploaded photo's address; shown instead of `image`. Cached on the phone after the first load. */
  photo?: string;
  tint: string;
  kind: ProductKind;
  style?: StyleProp<ViewStyle>;
  position?: ImageContentPosition;
  iconSize?: number;
  /** Describes the picture for screen readers; leave out when the name is written next to it. */
  label?: string;
}

/** A product photo, or a tinted placeholder with the product's shape when no photo exists yet. */
export function ProductImage({ image, photo, tint, kind, style, position = 'center', iconSize = 32, label }: ProductImageProps) {
  const source = photo ? { uri: photo } : image ? images[image] : undefined;
  return (
    <View style={[styles.frame, { backgroundColor: tint }, style]}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={position}
          cachePolicy="memory-disk"
          transition={150}
          recyclingKey={photo ?? image}
          accessible={Boolean(label)}
          accessibilityLabel={label}
        />
      ) : (
        <View style={styles.placeholder}>
          <Icon name={kindIcon[kind]} size={iconSize} color="rgba(11,31,58,0.28)" strokeWidth={1.4} />
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
