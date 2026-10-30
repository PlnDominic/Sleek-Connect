import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { colors, defaultDeliveryArea, estimate, formatPrice, momoNetworks, quote, type DeliveryConfig, type MomoNetwork } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppText } from '@/components/AppText';
import { Button, Card, Choices, Field, Notice } from '@/components/Form';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { BackButton, BottomBar, useScreenTop } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getDeliveryConfig, notifyCodOrder, placeOrder, requestPayment, type PaymentRequest, type PlacedOrder } from '@/lib/checkout';
import { getOrderStatus, rememberOrder } from '@/lib/orders';
import { registerForPush } from '@/lib/push';
import { useQuery } from '@/lib/query';
import { supabase } from '@/lib/supabase';

const POLL_MS = 3000;

interface SavedAddress {
  recipient_name: string;
  phone: string;
  area: string;
  ghanapost_gps: string | null;
  directions: string | null;
}

/** Details, delivery and Mobile Money in one screen; then waits for the shopper to approve the prompt on their phone. */
export default function CheckoutScreen() {
  const top = useScreenTop();
  const { items, count, subtotal } = useBag();
  const delivery = useQuery('delivery-config', getDeliveryConfig, 5 * 60_000);
  const [placed, setPlaced] = useState<Placed | null>(null);

  if (items.length === 0 && !placed) {
    return (
      <View style={[styles.screen, { paddingTop: top, paddingHorizontal: 20 }]}>
        <Header />
        <EmptyState icon="bag" title="Your bag is empty" message="Add something to your bag first." action={{ label: 'Start shopping', onPress: () => router.replace('/shop') }} />
      </View>
    );
  }
  if (!delivery.data) {
    return (
      <View style={[styles.screen, { paddingTop: top, paddingHorizontal: 20, gap: 16 }]}>
        <Header />
        {delivery.error ? <ErrorState onRetry={() => void delivery.refetch()} /> : <Skeleton style={{ height: 260, borderRadius: 12 }} />}
      </View>
    );
  }
  return placed ? (
    <Waiting placed={placed} onRetryDetails={() => setPlaced(null)} />
  ) : (
    <Details delivery={delivery.data} items={items} count={count} subtotal={subtotal} onPlaced={setPlaced} />
  );
}

/** An order that has been placed, with the payer to charge and what happened to the first payment prompt. */
interface Placed {
  order: PlacedOrder;
  payer: { network: MomoNetwork; wallet: string };
  prompt: PaymentRequest;
}

function Header({ title = 'Checkout' }: { title?: string }) {
  return (
    <View style={styles.titleRow}>
      <BackButton fallback="/bag" />
      <AppText weight="semibold" size={22} accessibilityRole="header">
        {title}
      </AppText>
    </View>
  );
}

function Details({
  delivery,
  items,
  count,
  subtotal,
  onPlaced,
}: {
  delivery: DeliveryConfig;
  items: ReturnType<typeof useBag>['items'];
  count: number;
  subtotal: number;
  onPlaced: (placed: Placed) => void;
}) {
  const top = useScreenTop();
  const { user } = useAuth();
  const areas = delivery.areas.map((a) => a.name);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [area, setArea] = useState(areas.includes(defaultDeliveryArea) ? defaultDeliveryArea : (areas[0] ?? ''));
  const [directions, setDirections] = useState('');
  const [gps, setGps] = useState('');
  const [optionId, setOptionId] = useState(delivery.options[0]?.id ?? '');
  const [payWith, setPayWith] = useState<'momo' | 'cod'>('momo');
  const [network, setNetwork] = useState<MomoNetwork>('mtn');
  const [wallet, setWallet] = useState('');
  const { clear } = useBag();
  const [promo, setPromo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const soldOut = items.some((i) => i.inStock === false);
  const filled = useRef(false);

  // Signed-in shoppers start with their saved address and Mobile Money number.
  useEffect(() => {
    if (!user || filled.current) return;
    filled.current = true;
    void (async () => {
      const [address, method] = await Promise.all([
        supabase
          .from('customer_addresses')
          .select('recipient_name, phone, area, ghanapost_gps, directions')
          .order('is_default', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('saved_payment_methods').select('network, wallet_number').order('is_default', { ascending: false }).limit(1).maybeSingle(),
      ]);
      const a = address.data as SavedAddress | null;
      if (a) {
        setName((v) => v || a.recipient_name);
        setPhone((v) => v || a.phone);
        if (areas.includes(a.area)) setArea(a.area);
        setDirections((v) => v || (a.directions ?? ''));
        setGps((v) => v || (a.ghanapost_gps ?? ''));
      }
      const m = method.data as { network: MomoNetwork; wallet_number: string } | null;
      if (m) {
        setNetwork(m.network);
        setWallet((v) => v || m.wallet_number);
      }
    })();
    // The address list only matters the first time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const quotes = useMemo(() => delivery.options.map((o) => ({ option: o, q: quote(delivery, area, o.id, subtotal) })), [delivery, area, subtotal]);
  const chosen = quotes.find((x) => x.option.id === optionId);
  const fee = chosen?.q.available ? chosen.q.fee : null;

  // Pay on delivery needs a known total, and may be capped by the store.
  const codSetting = delivery.payOnDelivery;
  const total = fee === null ? null : subtotal + fee;
  const codBlocked =
    total === null ? 'Choose an area with a delivery fee first.' : codSetting.maxGhs !== null && total > codSetting.maxGhs ? `Available for orders up to ${formatPrice(codSetting.maxGhs)}.` : null;
  const cod = payWith === 'cod' && codSetting.enabled && codBlocked === null;

  const canPlace = !soldOut && !busy && !!chosen?.q.available;

  async function submit() {
    setError(null);
    if (name.trim().length < 2) return setError('Enter the name of the person receiving the order.');
    if (phone.replace(/\D/g, '').length < 9) return setError('Enter a phone number we can call for delivery.');
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Check the email address, or leave it empty.');
    if (!cod && wallet.replace(/\D/g, '').length < 9) return setError('Enter the Mobile Money number you will pay from.');
    setBusy(true);
    try {
      const order = await placeOrder({
        customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, area, ghanapostGps: gps.trim() || undefined, directions: directions.trim() || undefined },
        deliveryOption: optionId,
        payment: cod ? { cod: true } : { network, wallet: wallet.trim() },
        items: items.map((i) => ({ slug: i.slug, size: i.sizeId, quantity: i.qty })),
        promoCode: promo,
        signedIn: !!user,
      });
      rememberOrder({ token: order.orderToken, orderNumber: order.orderNumber });
      // Asking now is the moment shoppers expect updates; "no" never blocks the order.
      void registerForPush(order.orderToken);
      if (cod) {
        // Nothing to charge: staff call to confirm, and the rider collects the cash.
        void notifyCodOrder(order.orderToken);
        clear();
        router.replace({ pathname: '/orders/[token]', params: { token: order.orderToken } });
        return;
      }
      const payer = { network, wallet: wallet.trim() };
      onPlaced({ order, payer, prompt: await requestPayment(order.orderToken, payer) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t place your order. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: top }]} keyboardShouldPersistTaps="handled">
        <Header />

        <Card title={`Your order · ${count} ${count === 1 ? 'item' : 'items'}`}>
          {items.map((item) => (
            <View key={`${item.slug}|${item.sizeId ?? ''}`} style={styles.line}>
              <ProductImage image={item.image} photo={item.photo} tint={item.tint} kind={item.kind} style={styles.thumb} iconSize={18} />
              <View style={styles.flex}>
                <AppText weight="semibold" size={14} numberOfLines={2}>
                  {item.name}
                </AppText>
                <AppText size={12} color={colors.textMuted}>
                  {[item.sizeLabel, `Qty ${item.qty}`].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <AppText weight="bold" size={14}>
                {formatPrice(item.lineTotal)}
              </AppText>
            </View>
          ))}
        </Card>

        <Card title="Delivery details">
          <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
          <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="024 123 4567" hint="The rider calls this number." />
          <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" hint="We’ll email your order updates as well as texting them." />
          <Choices label="Area" value={area} options={areas.map((a) => ({ id: a, label: a }))} onChange={setArea} />
          <Field label="Directions (optional)" value={directions} onChangeText={setDirections} multiline placeholder="Landmarks, gate colour, floor…" />
          <Field label="GhanaPost GPS (optional)" value={gps} onChangeText={setGps} autoCapitalize="characters" placeholder="GA-123-4567" />
        </Card>

        <Card title="Delivery">
          <Choices
            label="How soon"
            value={optionId}
            onChange={setOptionId}
            options={quotes.map(({ option, q }) => ({
              id: option.id,
              label: option.label,
              sub: q.available ? `${q.free ? 'Free' : q.fee === null ? 'Fee to be confirmed' : formatPrice(q.fee)} · ${estimate(option, new Date())}` : 'Not available for this area',
              disabled: !q.available,
            }))}
          />
        </Card>

        <Card title="Payment">
          {codSetting.enabled ? (
            <Choices
              label="How you pay"
              value={cod ? 'cod' : 'momo'}
              onChange={setPayWith}
              options={[
                { id: 'momo', label: 'Mobile Money', sub: 'Approve a prompt on your phone' },
                { id: 'cod', label: 'Pay on delivery', sub: codBlocked ?? 'Pay cash to the rider. We call you to confirm first.', disabled: codBlocked !== null },
              ]}
            />
          ) : null}
          {cod ? (
            <AppText size={13} color={colors.textMuted}>
              We’ll call you to confirm the order before we pack it. Have {total === null ? 'the total' : formatPrice(total)} in cash ready for the rider. Not available for items from independent stores.
            </AppText>
          ) : (
            <>
              <Choices label="Network" value={network} onChange={setNetwork} options={momoNetworks.map((n) => ({ id: n.id, label: n.label }))} />
              <Field label="Mobile Money number" value={wallet} onChangeText={setWallet} keyboardType="phone-pad" placeholder="024 123 4567" hint="You will get a prompt on this phone to approve the payment." />
            </>
          )}
          <Field label="Promo code (optional)" value={promo} onChangeText={setPromo} autoCapitalize="characters" />
        </Card>

        <Card>
          <Row label="Subtotal" value={formatPrice(subtotal)} />
          <Row label="Delivery" value={fee === null ? 'To be confirmed' : fee === 0 ? 'Free' : formatPrice(fee)} />
          <Row label="Total" value={fee === null ? 'To be confirmed' : formatPrice(subtotal + fee)} bold />
          <AppText size={12} color={colors.textMuted}>
            The final total is worked out by the store when you place the order; any promo code is taken off then.
          </AppText>
        </Card>

        {soldOut && <Notice>Something in your bag is sold out. Remove it in your bag to continue.</Notice>}
        {error && <Notice>{error}</Notice>}
      </ScrollView>
      <BottomBar>
        <Button label={busy ? 'Placing your order…' : cod ? 'Place order, pay on delivery' : 'Place order and pay'} onPress={() => void submit()} disabled={!canPlace} busy={busy} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.total}>
      <AppText size={14} color={bold ? colors.ink : colors.textMuted} weight={bold ? 'bold' : 'regular'}>
        {label}
      </AppText>
      <AppText weight="bold" size={bold ? 17 : 14}>
        {value}
      </AppText>
    </View>
  );
}

/** After the order is placed: wait for the shopper to approve the prompt, then show the order. */
function Waiting({ placed, onRetryDetails }: { placed: Placed; onRetryDetails: () => void }) {
  const { order, payer } = placed;
  const top = useScreenTop();
  const { clear } = useBag();
  const [outcome, setOutcome] = useState<'waiting' | 'paid' | 'lapsed'>('waiting');
  const [prompt, setPrompt] = useState(placed.prompt);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const status = await getOrderStatus(order.orderToken);
        if (stopped) return;
        if (status && status.status !== 'pending_payment') {
          if (status.status === 'cancelled') setOutcome('lapsed');
          else {
            setOutcome('paid');
            clear();
            router.replace({ pathname: '/orders/[token]', params: { token: order.orderToken } });
          }
          return;
        }
      } catch {
        // Offline for a moment: keep trying.
      }
      timer = setTimeout(check, POLL_MS);
    };
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [order.orderToken, clear]);

  const until = new Date(order.reservedUntil).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' });

  return (
    <View style={[styles.screen, { paddingTop: top, paddingHorizontal: 20, gap: 16 }]}>
      <View style={styles.titleRow}>
        <BackButton fallback="/bag" />
        <AppText weight="semibold" size={22} accessibilityRole="header">
          {outcome === 'lapsed' ? 'Payment didn’t go through' : 'Approve the payment'}
        </AppText>
      </View>
      <Card>
        <AppText weight="bold" size={15}>
          Order {order.orderNumber}
          {order.total !== null ? ` · ${formatPrice(order.total)}` : ''}
        </AppText>
        {outcome === 'lapsed' ? (
          <>
            <AppText size={14} color={colors.textMuted}>
              The payment failed or ran out of time, so your items were released. Your bag is still here.
            </AppText>
            <Button label="Back to checkout" onPress={onRetryDetails} />
          </>
        ) : prompt.kind === 'requested' ? (
          <>
            <AppText size={14} color={colors.textMuted}>
              {prompt.testMode
                ? 'Test mode: no real prompt was sent. Complete the test payment on the server to continue.'
                : 'Check your phone and approve the Mobile Money prompt. This screen updates by itself.'}
            </AppText>
            <AppText size={13} color={colors.textMuted}>
              We are holding your items until {until}.
            </AppText>
          </>
        ) : (
          <>
            <Notice>{prompt.reason}</Notice>
            <Button
              label="Send the prompt again"
              kind="secondary"
              busy={resending}
              onPress={() => {
                setResending(true);
                void requestPayment(order.orderToken, payer)
                  .then(setPrompt)
                  .finally(() => setResending(false));
              }}
            />
          </>
        )}
        <Button label="View this order" kind="secondary" onPress={() => router.replace({ pathname: '/orders/[token]', params: { token: order.orderToken } })} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingBottom: 130, gap: 16 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 6 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
