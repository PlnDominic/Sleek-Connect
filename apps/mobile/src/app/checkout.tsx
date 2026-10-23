import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  city,
  colors,
  deliveryFees,
  formatPrice,
  formatPriceOr,
  momoNetworks,
  radii,
  sampleCustomer,
  type MomoNetwork,
} from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { BackButton, BottomBar, Checkbox, useScreenTop } from '@/components/ui';
import { fonts } from '@/theme/fonts';

type Status = 'idle' | 'awaitingApproval' | 'cardUnavailable';

export default function CheckoutScreen() {
  const top = useScreenTop();
  const { count, subtotal } = useBag();
  const [network, setNetwork] = useState<MomoNetwork>('mtn');
  const [wallet, setWallet] = useState(sampleCustomer.phone);
  const [gift, setGift] = useState(false);
  const [status, setStatus] = useState<Status>('idle');

  const networkLabel = momoNetworks.find((n) => n.id === network)!.label;
  const fee = deliveryFees.standard;
  const total = fee === null ? null : subtotal + fee;
  const waiting = status === 'awaitingApproval';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: top }]} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <BackButton fallback="/" />
          <AppText weight="semibold" size={22} accessibilityRole="header">
            Checkout
          </AppText>
        </View>

        <View style={[styles.card, styles.address]}>
          <Icon name="pin" size={20} color={colors.accent} strokeWidth={2} />
          <View style={styles.flex}>
            <AppText weight="bold" size={14}>
              {sampleCustomer.name} · {sampleCustomer.phone}
            </AppText>
            <AppText size={13} color={colors.textMuted} style={styles.lh}>
              {sampleCustomer.area}, {city} · {sampleCustomer.ghanaPostGps}
              {'\n'}Standard delivery
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit delivery details" hitSlop={8}>
            <AppText weight="bold" size={13}>
              Edit
            </AppText>
          </Pressable>
        </View>

        <View style={[styles.card, styles.gap14]}>
          <AppText weight="bold" size={15} accessibilityRole="header">
            Pay with Mobile Money
          </AppText>
          <View accessibilityRole="radiogroup" accessibilityLabel="Network" style={styles.networks}>
            {momoNetworks.map((n) => {
              const on = n.id === network;
              return (
                <Pressable
                  key={n.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    setNetwork(n.id);
                    setStatus('idle');
                  }}
                  style={[styles.network, on && styles.networkOn]}
                >
                  <AppText weight="bold" size={13} color={on ? colors.accentDeep : colors.ink}>
                    {n.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.field}>
            <AppText weight="semibold" size={13} nativeID="wallet-label">
              Wallet number
            </AppText>
            <TextInput
              accessibilityLabelledBy="wallet-label"
              accessibilityLabel="Wallet number"
              value={wallet}
              onChangeText={setWallet}
              keyboardType="phone-pad"
              autoComplete="tel"
              style={styles.input}
            />
          </View>
          <Pressable accessibilityRole="button" onPress={() => setStatus('cardUnavailable')} style={styles.alignStart}>
            <AppText weight="bold" size={13} style={styles.underline}>
              Pay by card instead
            </AppText>
          </Pressable>
          {status === 'cardUnavailable' && (
            <AppText size={13} color={colors.textMuted} accessibilityLiveRegion="polite">
              Card payments are coming soon. Please pay with Mobile Money for now.
            </AppText>
          )}
        </View>

        <View style={[styles.card, styles.gap10]}>
          <Row label={`${count} ${count === 1 ? 'item' : 'items'}`} value={formatPrice(subtotal)} />
          <Row label="Delivery" value={formatPriceOr(fee, 'To be confirmed')} />
          <Checkbox checked={gift} onChange={setGift} label="Send as a gift" />
          <View style={styles.totalRow}>
            <AppText weight="bold" size={17}>
              Total
            </AppText>
            <AppText weight="bold" size={17}>
              {formatPriceOr(total, 'To be confirmed')}
            </AppText>
          </View>
        </View>

        {waiting && (
          <View accessibilityRole="alert" style={styles.status}>
            <AppText weight="bold" size={15} color={colors.canvas}>
              Check your phone
            </AppText>
            <AppText size={13} color={colors.onDarkMuted} style={styles.lh}>
              We sent a {networkLabel} prompt to {wallet.trim() || 'your phone'}. Enter your PIN to approve. We never see
              your PIN.
            </AppText>
            <Pressable accessibilityRole="button" onPress={() => router.push('/track')} style={styles.approved}>
              <AppText weight="bold" size={14}>
                I&apos;ve approved it
              </AppText>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <BottomBar style={styles.gap8}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: waiting || count === 0 }}
          disabled={waiting || count === 0}
          // Payment provider integration is not built yet; this shows the designed approval step.
          onPress={() => setStatus('awaitingApproval')}
          style={({ pressed }) => [styles.pay, (pressed || waiting) && { opacity: 0.85 }]}
        >
          <AppText weight="bold" size={16} color={colors.canvas}>
            {waiting ? 'Waiting for approval...' : `Pay with ${networkLabel}`}
          </AppText>
        </Pressable>
        <View style={styles.secure}>
          <Icon name="lock" size={14} color={colors.textMuted} strokeWidth={2} />
          <AppText size={12} color={colors.textMuted}>
            Secure payment
          </AppText>
        </View>
      </BottomBar>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText size={14} color={colors.textMuted}>
        {label}
      </AppText>
      <AppText size={14}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 150,
    gap: 16,
  },
  flex: {
    flex: 1,
  },
  lh: {
    lineHeight: 20,
  },
  gap8: {
    gap: 8,
  },
  gap10: {
    gap: 10,
  },
  gap14: {
    gap: 14,
  },
  alignStart: {
    alignSelf: 'flex-start',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radii.xl,
    padding: 16,
  },
  address: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  networks: {
    flexDirection: 'row',
    gap: 8,
  },
  network: {
    flex: 1,
    height: 48,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkOn: {
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  field: {
    gap: 6,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.xxl,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  status: {
    backgroundColor: colors.ink,
    borderRadius: radii.xl,
    padding: 18,
    gap: 10,
  },
  approved: {
    alignSelf: 'flex-start',
    backgroundColor: colors.canvas,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.xxl,
  },
  pay: {
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
