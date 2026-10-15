import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, type IconName } from '@sleek/shared';
import { AppText } from './AppText';
import { Icon } from './Icon';

/** Top padding for screens: clears the status bar, with the design's 52pt as the minimum. */
export function useScreenTop() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top + 8, 52);
}

/** Bottom padding for sticky action bars, clearing the home indicator. */
export function useBarBottom() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 16) + 14;
}

interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress?: () => void;
  background?: string;
  round?: boolean;
  color?: string;
  iconSize?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  label,
  onPress,
  background = colors.surface,
  round,
  color = colors.ink,
  iconSize = 20,
  children,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: background, borderRadius: round ? radii.pill : radii.lg, opacity: pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={color} strokeWidth={icon === 'chevronLeft' ? 2 : 1.8} />
      {children}
    </Pressable>
  );
}

/** Back control that falls back to a given route when there is no history (deep links, web reloads). */
export function BackButton({ fallback, label = 'Back', background = colors.canvas }: { fallback: Href; label?: string; background?: string }) {
  return (
    <IconButton
      icon="chevronLeft"
      label={label}
      background={background}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
    />
  );
}

export function CountBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, style]}>
      <AppText weight="bold" size={10} color={colors.canvas}>
        {count}
      </AppText>
    </View>
  );
}

export function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText weight="semibold" size={18} accessibilityRole="header">
        {title}
      </AppText>
      <Pressable accessibilityRole="link" onPress={onSeeAll} hitSlop={8}>
        <AppText weight="semibold" size={13} style={styles.underline}>
          See all
        </AppText>
      </Pressable>
    </View>
  );
}

export function TrustChip({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <View style={[styles.chip, compact && styles.chipCompact]}>
      <AppText weight="bold" size={compact ? 11 : 12} color={colors.teal}>
        {label}
      </AppText>
    </View>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.checkboxRow}
    >
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked && <AppText weight="bold" size={12} color={colors.canvas}>✓</AppText>}
      </View>
      <AppText size={14}>{label}</AppText>
    </Pressable>
  );
}

/** White action bar pinned to the bottom of a screen. */
export function BottomBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const bottom = useBarBottom();
  return <View style={[styles.bottomBar, { paddingBottom: bottom }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 4,
    top: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.tealSoft,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.md,
  },
  chipCompact: {
    paddingVertical: 3,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 14,
    paddingHorizontal: 20,
  },
});
