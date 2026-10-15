import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, radii, type IconName } from '@sleek/shared';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useScreenTop } from './ui';

/** Simple titled screen for tabs the design doesn't cover yet. */
export function TabPlaceholder({ title, icon, message }: { title: string; icon: IconName; message: string }) {
  const top = useScreenTop();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top }]}>
      <AppText weight="semibold" size={22} accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.empty}>
        <View style={styles.icon}>
          <Icon name={icon} size={26} color={colors.textMuted} />
        </View>
        <AppText size={14} color={colors.textMuted} style={styles.message}>
          {message}
        </AppText>
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
    gap: 22,
  },
  empty: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 48,
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
    maxWidth: 260,
    lineHeight: 20,
  },
});
