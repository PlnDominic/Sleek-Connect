import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, type IconName } from '@sleek/shared';
import { AppText } from './AppText';
import { Icon } from './Icon';

/** A grey block that gently pulses while content loads. */
export function Skeleton({ style }: { style?: object }) {
  const [opacity] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, style, { opacity }]} />;
}

/** Placeholder tiles shown in the shape of the product grid while it loads. */
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.grid} accessibilityLabel="Loading products" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.cell}>
          <Skeleton style={styles.image} />
          <Skeleton style={styles.line} />
          <Skeleton style={styles.lineShort} />
        </View>
      ))}
    </View>
  );
}

/** Shown when something couldn't be loaded, with a way to try again. */
export function ErrorState({ message = "We couldn't load this. Check your connection and try again.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.state} accessibilityRole="alert">
      <View style={styles.icon}>
        <Icon name="alert" size={26} color={colors.textMuted} />
      </View>
      <AppText size={14} color={colors.textMuted} style={styles.message}>
        {message}
      </AppText>
      {onRetry && (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
          <AppText weight="bold" size={14} color={colors.canvas}>
            Try again
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.state}>
      <View style={styles.icon}>
        <Icon name={icon} size={26} color={colors.textMuted} />
      </View>
      <AppText weight="bold" size={17}>
        {title}
      </AppText>
      <AppText size={14} color={colors.textMuted} style={styles.message}>
        {message}
      </AppText>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={styles.button}>
          <AppText weight="bold" size={14} color={colors.canvas}>
            {action.label}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 18,
    columnGap: 14,
  },
  cell: {
    width: '47.5%',
    flexGrow: 1,
    gap: 8,
  },
  image: {
    aspectRatio: 1,
    borderRadius: radii.xl,
  },
  line: {
    height: 14,
    width: '90%',
  },
  lineShort: {
    height: 14,
    width: '40%',
  },
  state: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 48,
    paddingHorizontal: 12,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  button: {
    marginTop: 4,
    height: 46,
    paddingHorizontal: 24,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
