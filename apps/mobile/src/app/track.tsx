import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, radii, sampleOrder, type OrderStepState } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { BackButton, BottomBar, useScreenTop } from '@/components/ui';

const stepColors: Record<OrderStepState, { dot: string; ring?: string; text: string }> = {
  done: { dot: colors.ink, text: colors.ink },
  current: { dot: colors.accent, text: colors.ink },
  upcoming: { dot: colors.canvas, ring: colors.lineInactive, text: colors.textDisabled },
};

export default function TrackOrderScreen() {
  const top = useScreenTop();
  const order = sampleOrder;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: top }]}>
        <View style={styles.titleRow}>
          <BackButton fallback="/" label="Back to home" background={colors.surface} />
          <View>
            <AppText weight="bold" size={20} accessibilityRole="header">
              Track order
            </AppText>
            <AppText size={12} color={colors.textMuted}>
              #SC-{order.number} · Paid with {order.paidWith}
            </AppText>
          </View>
        </View>

        <View style={styles.map}>
          {/* Placeholder until a live rider location feed exists. */}
          <Svg width="100%" height="100%" viewBox="0 0 350 170" accessibilityLabel="Map placeholder showing rider route">
            <Path d="M0 40 H350 M0 110 H350 M70 0 V170 M190 0 V170 M290 0 V170" stroke={colors.canvas} strokeWidth={10} />
            <Path
              d="M40 140 C90 140 90 75 190 75 S270 30 300 30"
              fill="none"
              stroke={colors.accent}
              strokeWidth={4}
              strokeDasharray="2 8"
              strokeLinecap="round"
            />
            <Circle cx={40} cy={140} r={8} fill={colors.ink} />
            <Circle cx={300} cy={30} r={10} fill={colors.accent} />
            <Circle cx={300} cy={30} r={4} fill={colors.canvas} />
          </Svg>
          <View style={styles.eta}>
            <AppText weight="semibold" size={12}>
              {order.eta}
            </AppText>
          </View>
        </View>

        <View style={styles.rider}>
          <View style={styles.avatar} />
          <View style={styles.flex}>
            <AppText weight="bold" size={14}>
              {order.rider.name}
            </AppText>
            <AppText size={13} color={colors.textMuted}>
              Your rider · {order.rider.vehicle}
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Call rider" style={styles.call}>
            <Icon name="call" size={18} color={colors.canvas} strokeWidth={2} />
          </Pressable>
        </View>

        <View accessibilityLabel="Order progress">
          {order.steps.map((step, i) => {
            const c = stepColors[step.state];
            const last = i === order.steps.length - 1;
            return (
              <View key={step.title} style={styles.step}>
                  <View style={styles.rail}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: c.dot },
                        c.ring ? { borderWidth: 2, borderColor: c.ring } : null,
                      ]}
                    >
                      {step.state === 'done' && (
                        <AppText weight="bold" size={12} color={colors.canvas}>
                          ✓
                        </AppText>
                      )}
                    </View>
                    <View
                      style={[
                        styles.line,
                        { backgroundColor: last ? 'transparent' : step.state === 'done' ? colors.ink : colors.lineTrack },
                      ]}
                    />
                  </View>
                  <View style={styles.stepText}>
                    <AppText weight="semibold" size={14} color={c.text}>
                      {step.title}
                    </AppText>
                    <AppText size={12} color={colors.textMuted}>
                      {step.detail}
                    </AppText>
                  </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <BottomBar style={styles.actions}>
        <Pressable accessibilityRole="button" style={[styles.action, styles.actionOutline]}>
          <AppText weight="semibold" size={14}>
            Request a return
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="button" style={[styles.action, styles.actionDark]}>
          <AppText weight="semibold" size={14} color={colors.canvas}>
            Chat with support
          </AppText>
        </Pressable>
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 16,
  },
  flex: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  map: {
    height: 170,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceMap,
    overflow: 'hidden',
  },
  eta: {
    position: 'absolute',
    left: 12,
    top: 12,
    backgroundColor: colors.canvas,
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  rider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.avatar[1],
  },
  call: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  step: {
    flexDirection: 'row',
    gap: 14,
  },
  rail: {
    width: 22,
    alignItems: 'center',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 22,
  },
  stepText: {
    paddingBottom: 14,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
    height: 50,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionOutline: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  actionDark: {
    backgroundColor: colors.ink,
  },
});
