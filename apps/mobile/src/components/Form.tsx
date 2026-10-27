import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radii } from '@sleek/shared';
import { fonts } from '@/theme/fonts';
import { AppText } from './AppText';

/** A labelled text box. */
export function Field({ label, hint, style, ...input }: { label: string; hint?: string; style?: StyleProp<ViewStyle> } & TextInputProps) {
  return (
    <View style={[styles.field, style]}>
      <AppText weight="semibold" size={13}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textPlaceholder}
        {...input}
        style={[styles.input, input.multiline && styles.multiline]}
      />
      {hint ? (
        <AppText size={12} color={colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Button({ label, onPress, kind = 'primary', disabled, busy, style, children }: ButtonProps) {
  const off = disabled || busy;
  const color = off ? colors.textMuted : kind === 'primary' ? colors.canvas : kind === 'danger' ? '#B42318' : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.button, kind === 'primary' ? styles.primary : styles.secondary, off && styles.off, pressed && { opacity: 0.85 }, style]}
    >
      {busy ? <ActivityIndicator color={colors.textMuted} /> : children}
      <AppText weight="bold" size={16} color={color}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** One choice out of a few, shown as chips. */
export function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; sub?: string; disabled?: boolean }[];
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.field}>
      <AppText weight="semibold" size={13}>
        {label}
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.choices}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: o.disabled }}
              disabled={o.disabled}
              onPress={() => onChange(o.id)}
              style={[styles.choice, on && styles.choiceOn, o.disabled && { opacity: 0.4 }]}
            >
              <AppText weight="semibold" size={14} color={on ? colors.canvas : colors.ink}>
                {o.label}
              </AppText>
              {o.sub ? (
                <AppText size={12} color={on ? colors.canvas : colors.textMuted}>
                  {o.sub}
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A white card with a heading. */
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? (
        <AppText weight="bold" size={15} accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

/** A message the shopper must see: an error or a heads-up. */
export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <View style={[styles.notice, tone === 'good' && styles.noticeGood]} accessibilityRole="alert">
      <AppText size={13} color={tone === 'good' ? colors.tealInk : colors.accentDeep} style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  multiline: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  button: {
    minHeight: 52,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  off: { backgroundColor: colors.surfaceSunken, borderColor: colors.surfaceSunken },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
  },
  choiceOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  card: { gap: 14, padding: 18, borderRadius: radii.xl, backgroundColor: colors.canvas },
  notice: { padding: 12, borderRadius: radii.lg, backgroundColor: '#FDF0D6', flexDirection: 'row' },
  noticeGood: { backgroundColor: colors.tealSoft },
});
