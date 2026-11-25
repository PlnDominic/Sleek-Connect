import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { formatPriceOr, radii, statusShort } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Button, Card, Field, Notice } from '@/components/Form';
import { EmptyState, ErrorState } from '@/components/States';
import { TrackingBar } from '@/components/TrackingBar';
import { BackButton, useScreenTop } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { findOrder, formatDate, getMyOrders, readRecentOrders, type OrderSummary } from '@/lib/orders';
import { useQuery } from '@/lib/query';
import { useColors, useStyles, type Palette } from '@/theme/theme';

/** Orders for the signed-in shopper, orders opened on this phone, and a way to find any order by number and phone. */
export default function OrdersScreen() {
  const colors = useColors();
  const styles = useStyles(makeStyles);
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
        <>
          <AppText weight="bold" size={12} color={colors.textMuted} style={styles.sectionLabel}>
            YOUR ORDERS
          </AppText>
          {mine.loading ? (
            <AppText size={14} color={colors.textMuted}>
              Loading…
            </AppText>
          ) : mine.error && !mine.data?.length ? (
            <ErrorState onRetry={() => void mine.refetch()} />
          ) : (mine.data ?? []).length === 0 ? (
            <EmptyState
              icon="box"
              title="No orders yet"
              message="Orders you place with this account will appear here."
              action={{ label: 'Start shopping', onPress: () => router.push('/shop') }}
            />
          ) : (
            <>
              {mine.error && <Notice>Showing your last loaded orders. Check your connection and refresh for updates.</Notice>}
              <Button label="Refresh orders" kind="secondary" busy={mine.refreshing} onPress={() => void mine.refetch()} />
              {(mine.data ?? []).map((o) => <OrderRow key={o.order_token} order={o} />)}
            </>
          )}
        </>
      )}

      {onThisPhone.length > 0 && (
        <>
          <AppText weight="bold" size={12} color={colors.textMuted} style={styles.sectionLabel}>
            OPENED ON THIS PHONE
          </AppText>
          <View style={styles.group}>
            {onThisPhone.map((r) => (
              <Pressable
                key={r.token}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/orders/[token]', params: { token: r.token } })}
                style={({ pressed }) => [styles.phoneRow, pressed && { opacity: 0.7 }]}
              >
                <AppText weight="semibold" size={15}>
                  Order {r.orderNumber}
                </AppText>
                <AppText weight="semibold" size={13} color={colors.accent}>
                  Track ›
                </AppText>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <AppText weight="bold" size={12} color={colors.textMuted} style={styles.sectionLabel}>
        FIND AN ORDER
      </AppText>
      <Card>
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
  const colors = useColors();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Order ${order.order_number}, ${statusShort[order.status]}`}
      onPress={() => router.push({ pathname: '/orders/[token]', params: { token: order.order_token } })}
      style={styles.orderRow}
    >
      <View style={styles.simpleRow}>
        <View style={styles.flex}>
          <AppText weight="bold" size={16}>
            Order {order.order_number}
          </AppText>
          <AppText size={12} color={colors.textMuted}>
            {formatDate(order.created_at)} · {order.item_count} {order.item_count === 1 ? 'item' : 'items'}
          </AppText>
        </View>
        <View style={styles.pill}>
          <AppText weight="bold" size={11} color={colors.accentDeep}>
            {statusShort[order.status]}
          </AppText>
        </View>
      </View>
      <TrackingBar status={order.status} compact />
      <View style={styles.totalRow}>
        <AppText size={13} color={colors.textMuted}>
          Total
        </AppText>
        <AppText weight="bold" size={16}>
          {formatPriceOr(order.total_ghs, 'To be confirmed')}
        </AppText>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  simpleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  flex: { flex: 1 },
  sectionLabel: { letterSpacing: 0.8, paddingLeft: 4, marginBottom: -6 },
  orderRow: { gap: 14, padding: 16, borderRadius: radii.xl, backgroundColor: colors.canvas },
  pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radii.pill, backgroundColor: colors.surface },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  group: { borderRadius: radii.xl, backgroundColor: colors.canvas, overflow: 'hidden' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
