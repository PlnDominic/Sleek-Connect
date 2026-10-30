import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  buildTimeline,
  colors,
  expectedDelivery,
  finalStatuses,
  formatPrice,
  formatPriceOr,
  momoNetworks,
  networkNames,
  payOnDeliveryLabels,
  statusLabels,
  trackingProgress,
  type MomoNetwork,
} from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Button, Card, Choices, Field, Notice } from '@/components/Form';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { TrackingBar } from '@/components/TrackingBar';
import { BackButton, useScreenTop } from '@/components/ui';
import { getDeliveryConfig, requestPayment } from '@/lib/checkout';
import { cancelOrder, formatDate, formatDateTime, getOrder, rememberOrder, type CustomerOrder } from '@/lib/orders';
import { pushAllowed, registerForPush } from '@/lib/push';
import { useQuery } from '@/lib/query';
import { openSite } from '@/lib/site';

const REFRESH_MS = 15_000;

export default function OrderScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const top = useScreenTop();
  const { data: order, error, loading, refetch } = useQuery(token ? `order:${token}` : null, () => getOrder(token), 5_000);

  // Follows the order while it is still moving.
  const finished = order ? finalStatuses.includes(order.status) : false;
  useEffect(() => {
    if (!token || finished) return;
    const timer = setInterval(() => void refetch(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [token, finished, refetch]);

  useEffect(() => {
    if (order && token) {
      rememberOrder({ token, orderNumber: order.order_number });
      // If the shopper already allowed notifications, this phone follows this order.
      void registerForPush(token, { ask: false });
    }
  }, [order, token]);

  if (!order) {
    return (
      <View style={[styles.screen, { paddingTop: top, paddingHorizontal: 20, gap: 16 }]}>
        <Header />
        {loading ? (
          <Skeleton style={{ height: 220, borderRadius: 12 }} />
        ) : error ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <EmptyState icon="box" title="We can’t find this order" message="The link may be incomplete. Find your order with its number and phone." action={{ label: 'Find my order', onPress: () => router.replace('/orders') }} />
        )}
      </View>
    );
  }
  return <OrderView order={order} token={token} onChanged={() => void refetch()} />;
}

function Header({ title = 'Your order' }: { title?: string }) {
  return (
    <View style={styles.titleRow}>
      <BackButton fallback="/orders" />
      <AppText weight="semibold" size={22} accessibilityRole="header">
        {title}
      </AppText>
    </View>
  );
}

function OrderView({ order, token, onChanged }: { order: CustomerOrder; token: string; onChanged: () => void }) {
  const top = useScreenTop();
  const delivery = useQuery('delivery-config', getDeliveryConfig, 5 * 60_000);
  const progress = trackingProgress(order.status);
  const timeline = buildTimeline(order);
  const payOnDelivery = order.payment_method === 'cod';
  const dispatchFrom = order.paid_at ?? order.cod_confirmed_at;
  const arrival = dispatchFrom ? expectedDelivery(delivery.data?.options.find((o) => o.id === order.delivery_option), dispatchFrom) : null;
  const [notifying, setNotifying] = useState<'unknown' | 'on' | 'off'>('unknown');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void pushAllowed().then((on) => setNotifying(on ? 'on' : 'off'));
  }, []);

  function confirmCancel() {
    Alert.alert('Cancel this order?', 'Your items go back on the shelf. If you have paid, we will refund you.', [
      { text: 'Keep the order', style: 'cancel' },
      {
        text: 'Cancel the order',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          setMessage(null);
          cancelOrder(token)
            .then(onChanged)
            .catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : 'We could not cancel the order.'))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top }]}>
      <Header title={`Order ${order.order_number}`} />

      <Card>
        <AppText weight="bold" size={18}>
          {(payOnDelivery && payOnDeliveryLabels[order.status]) || statusLabels[order.status]}
        </AppText>
        <TrackingBar status={order.status} />
        {progress.problem ? <Notice>{progress.problem}</Notice> : null}
        {arrival && order.status !== 'delivered' && order.status !== 'cancelled' && order.status !== 'returned' ? (
          <AppText size={13} color={colors.textMuted}>
            Expected delivery: {arrival}
          </AppText>
        ) : null}
        {order.status === 'delivered' && order.delivered_at ? (
          <AppText size={13} color={colors.textMuted}>
            Delivered {formatDateTime(order.delivered_at)}
          </AppText>
        ) : null}
      </Card>

      {order.status === 'pending_payment' && !payOnDelivery && <PayAgain token={token} reservedUntil={order.reserved_until} onChanged={onChanged} />}
      {payOnDelivery && ['pending_payment', 'paid', 'packing', 'packed', 'out_for_delivery'].includes(order.status) ? (
        <Card title="Pay on delivery">
          <AppText size={14}>
            {order.status === 'pending_payment'
              ? 'We’ll call you to confirm this order. '
              : ''}
            Pay {formatPriceOr(order.total_ghs, 'the total')} in cash to the rider when it arrives.
          </AppText>
        </Card>
      ) : null}

      {order.status === 'out_for_delivery' && order.delivery_code ? (
        <Card title="Your delivery code">
          <AppText weight="bold" size={32} style={styles.code} accessibilityLabel={`Delivery code ${order.delivery_code.split('').join(' ')}`}>
            {order.delivery_code}
          </AppText>
          <AppText size={13} color={colors.textMuted}>
            Give this code to the rider only when you have your order in hand.
            {order.rider ? ` Your rider is ${order.rider.name} (${order.rider.vehicle}).` : ''}
            {order.courier_reference ? ` Courier reference: ${order.courier_reference}.` : ''}
          </AppText>
        </Card>
      ) : null}

      <Card title={`Items · ${order.items.length}`}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.line}>
            <View style={styles.flex}>
              <AppText weight="semibold" size={14}>
                {item.name}
              </AppText>
              <AppText size={12} color={colors.textMuted}>
                {[item.size_label, `Qty ${item.quantity}`].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            <AppText weight="bold" size={14}>
              {formatPrice(item.line_total_ghs)}
            </AppText>
          </View>
        ))}
        <Total label="Subtotal" value={formatPrice(order.subtotal_ghs)} />
        <Total label="Delivery" value={order.delivery_fee_ghs === null ? 'To be confirmed' : order.delivery_fee_ghs === 0 ? 'Free' : formatPrice(order.delivery_fee_ghs)} />
        <Total label="Total" value={formatPriceOr(order.total_ghs, 'To be confirmed')} bold />
        <AppText size={12} color={colors.textMuted}>
          {order.payment_method === 'cod' ? 'Pay on delivery (cash)' : order.payment_method === 'card' ? 'Card' : `${order.momo_network ? networkNames[order.momo_network] : 'Mobile Money'}${order.wallet_ending ? `, wallet ending ${order.wallet_ending}` : ''}`}
        </AppText>
      </Card>

      <Card title="Delivery">
        <AppText size={14}>
          {order.customer_name} · {order.area}
        </AppText>
        <AppText size={12} color={colors.textMuted}>
          Placed {formatDate(order.created_at)}
        </AppText>
      </Card>

      <Card title="History">
        {timeline.map((step) => (
          <View key={step.key} style={styles.step}>
            <View style={[styles.dot, step.state === 'done' && styles.dotDone, step.state === 'current' && styles.dotCurrent]} />
            <View style={styles.flex}>
              <AppText weight={step.state === 'upcoming' ? 'regular' : 'semibold'} size={14} color={step.state === 'upcoming' ? colors.textMuted : colors.ink}>
                {step.title}
              </AppText>
              {step.at ? (
                <AppText size={12} color={colors.textMuted}>
                  {formatDateTime(step.at)}
                  {step.detail ? ` · ${step.detail}` : ''}
                </AppText>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      {message ? <Notice>{message}</Notice> : null}
      {notifying === 'off' && (
        <Button
          label="Tell me when it moves"
          kind="secondary"
          onPress={() => void registerForPush(token).then((r) => setNotifying(r === 'granted' ? 'on' : 'off'))}
        />
      )}
      {order.can_cancel && <Button label="Cancel this order" kind="danger" busy={busy} onPress={confirmCancel} style={styles.cancel} />}
      {order.return_open && <Button label="Return an item (opens our website)" kind="secondary" onPress={() => void openSite(`/orders/${token}/return`)} />}
      <Pressable accessibilityRole="link" onPress={() => void openSite(`/orders/${token}/receipt`)} style={styles.link}>
        <AppText weight="semibold" size={14} color={colors.accent}>
          View receipt on our website
        </AppText>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => void openSite('/help#contact')} style={styles.link}>
        <AppText weight="semibold" size={14} color={colors.accent}>
          Problem with this order? Contact us
        </AppText>
      </Pressable>
    </ScrollView>
  );
}

function Total({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.line}>
      <AppText size={14} color={bold ? colors.ink : colors.textMuted} weight={bold ? 'bold' : 'regular'} style={styles.flex}>
        {label}
      </AppText>
      <AppText weight="bold" size={bold ? 16 : 14}>
        {value}
      </AppText>
    </View>
  );
}

/** An unpaid order: send the Mobile Money prompt again to the same or another number. */
function PayAgain({ token, reservedUntil, onChanged }: { token: string; reservedUntil: string | null; onChanged: () => void }) {
  const [network, setNetwork] = useState<MomoNetwork>('mtn');
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const until = reservedUntil ? new Date(reservedUntil).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' }) : null;

  async function send() {
    if (wallet.replace(/\D/g, '').length < 9) return setResult({ ok: false, text: 'Enter the Mobile Money number to charge.' });
    setBusy(true);
    const r = await requestPayment(token, { network, wallet: wallet.trim() });
    setBusy(false);
    setResult(
      r.kind === 'requested'
        ? { ok: true, text: r.testMode ? 'Test mode: no real prompt was sent.' : 'Check your phone and approve the prompt. This page updates by itself.' }
        : { ok: false, text: r.reason },
    );
    onChanged();
  }

  return (
    <Card title="Pay for this order">
      <AppText size={13} color={colors.textMuted}>
        {until ? `We are holding your items until ${until}.` : 'We are holding your items for a short time.'}
      </AppText>
      <Choices label="Network" value={network} onChange={setNetwork} options={momoNetworks.map((n) => ({ id: n.id, label: n.label }))} />
      <Field label="Mobile Money number" value={wallet} onChangeText={setWallet} keyboardType="phone-pad" />
      {result ? <Notice tone={result.ok ? 'good' : 'warn'}>{result.text}</Notice> : null}
      <Button label="Send the payment prompt" onPress={() => void send()} busy={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  code: { letterSpacing: 8 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 12, height: 12, marginTop: 4, borderRadius: 6, backgroundColor: colors.lineTrack },
  dotDone: { backgroundColor: colors.accent },
  dotCurrent: { backgroundColor: colors.accentWarm },
  cancel: { marginTop: 4 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
