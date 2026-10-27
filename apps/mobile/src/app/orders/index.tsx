import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, formatPriceOr, radii, statusShort } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Button, Card, Field, Notice } from '@/components/Form';
import { TrackingBar } from '@/components/TrackingBar';
import { BackButton, useScreenTop } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { findOrder, formatDate, getMyOrders, readRecentOrders, type OrderSummary } from '@/lib/orders';
import { useQuery } from '@/lib/query';

/** Orders for the signed-in shopper, orders opened on this phone, and a way to find any order by number and phone. */
export default function OrdersScreen() {
  const top = useScreenTop();
  const { user } = useAuth();
  const mine = useQuery(user ? `my-orders:${user.id}` : null, getMyOrders, 15_000);
  const [recent] = useState(readRecentOrders);
  const [number, setNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const find = useCallback(async () => {
    if (!number.trim() || !phone.trim()) return setMessage('Enter the order number and the phone number used at checkout.');
    setBusy(true);
    setMessage(null);
    try {
      const token = await findOrder(number, phone);
      if (token) router.push({ pathname: '/orders/[token]', params: { token } });
      else setMessage('We couldn’t find an order with that number and phone. Check both (the order number looks like SC-1234). After several tries, lookups pause for an hour.');
    } catch {
      setMessage('We couldn’t look that up just now. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [number, phone]);

  const signedInTokens = new Set((mine.data ?? []).map((o) => o.order_token));
  const onThisPhone = recent.filter((r) => !signedInTokens.has(r.token));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top }]} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <BackButton fallback="/account" />
        <AppText weight="semibold" size={22} accessibilityRole="header">
          Your orders
        </AppText>
      </View>

      {user && (
        <Card title="Your account">
          {mine.loading ? (
            <AppText size={14} color={colors.textMuted}>
              Loading…
            </AppText>
          ) : (mine.data ?? []).length === 0 ? (
            <AppText size={14} color={colors.textMuted}>
              You haven’t placed any orders with this account yet.
            </AppText>
          ) : (
            (mine.data ?? []).map((o) => <OrderRow key={o.order_token} order={o} />)
          )}
        </Card>
      )}

      {onThisPhone.length > 0 && (
        <Card title="Opened on this phone">
          {onThisPhone.map((r) => (
            <Pressable key={r.token} accessibilityRole="link" onPress={() => router.push({ pathname: '/orders/[token]', params: { token: r.token } })} style={styles.simpleRow}>
              <AppText weight="semibold" size={15}>
                Order {r.orderNumber}
              </AppText>
              <AppText weight="semibold" size={13} color={colors.accent}>
                Track
              </AppText>
            </Pressable>
          ))}
        </Card>
      )}

      <Card title="Find an order">
        <AppText size={13} color={colors.textMuted}>
          You don’t need an account. Use the order number from your text message and the phone number used at checkout.
        </AppText>
        <Field label="Order number" value={number} onChangeText={setNumber} autoCapitalize="characters" placeholder="SC-1234" />
        <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="024 123 4567" />
        {message ? <Notice>{message}</Notice> : null}
        <Button label="Find my order" onPress={() => void find()} busy={busy} />
      </Card>
    </ScrollView>
  );
}

function OrderRow({ order }: { order: OrderSummary }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Order ${order.order_number}, ${statusShort[order.status]}`}
      onPress={() => router.push({ pathname: '/orders/[token]', params: { token: order.order_token } })}
      style={styles.orderRow}
    >
      <View style={styles.simpleRow}>
        <View>
          <AppText weight="bold" size={15}>
            Order {order.order_number}
          </AppText>
          <AppText size={12} color={colors.textMuted}>
            {formatDate(order.created_at)} · {order.item_count} {order.item_count === 1 ? 'item' : 'items'}
          </AppText>
        </View>
        <View style={styles.right}>
          <AppText weight="semibold" size={12} color={colors.accent}>
            {statusShort[order.status]}
          </AppText>
          <AppText weight="bold" size={14}>
            {formatPriceOr(order.total_ghs, 'To be confirmed')}
          </AppText>
        </View>
      </View>
      <TrackingBar status={order.status} compact />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  simpleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  orderRow: { gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, borderRadius: radii.sm },
  right: { alignItems: 'flex-end' },
});
