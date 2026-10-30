import { StyleSheet, View } from 'react-native';
import { colors, trackingProgress, trackingStages, type OrderStatus } from '@sleek/shared';
import { AppText } from './AppText';

/** Confirmed → Packed → On the way → Delivered, with the current step marked. */
export function TrackingBar({ status, compact }: { status: OrderStatus; compact?: boolean }) {
  const { done, current, problem } = trackingProgress(status);
  return (
    <View accessible accessibilityLabel={`Progress: ${done} of ${trackingStages.length} steps done`}>
      <View style={styles.track}>
        {trackingStages.map((stage, i) => (
          <View key={stage} style={[styles.segment, i < done && styles.done, i === current && styles.current, !!problem && styles.problem]} />
        ))}
      </View>
      {!compact && (
        <View style={styles.labels}>
          {trackingStages.map((stage, i) => (
            <AppText key={stage} size={11} weight={i === current ? 'bold' : 'regular'} color={i < done || i === current ? colors.ink : colors.textMuted} style={styles.label}>
              {stage}
            </AppText>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.lineTrack },
  done: { backgroundColor: colors.accent },
  current: { backgroundColor: colors.accentWarm },
  problem: { backgroundColor: colors.gold },
  labels: { flexDirection: 'row', gap: 4, marginTop: 6 },
  label: { flex: 1 },
});
