import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { canonicalArea, estimate, formatPrice, momoNetworks, quote, suggestAreas, type DeliveryConfig, type MomoNetwork } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { AppleButton, GoogleButton } from '@/components/SocialButtons';
import { AppText } from '@/components/AppText';
import { Button, Card, Checkbox, Choices, Field, Notice } from '@/components/Form';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { BackButton, BottomBar, useScreenTop } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getDeliveryConfig, getPaymentOptions, notifyCodOrder, openPaymentPage, placeOrder, requestPayment, type PaymentRequest, type PlacedOrder } from '@/lib/checkout';
import { getOrderStatus, rememberOrder } from '@/lib/orders';
import { registerForPush } from '@/lib/push';
import { siteAddress } from '@/lib/site';
import { useQuery } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { useColors, useStyles, type Palette } from '@/theme/theme';

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
  const styles = useStyles(makeStyles);
  const top = useScreenTop();
  const { items, count, subtotal } = useBag();
  const delivery = useQuery('delivery-config', getDeliveryConfig, 5 * 60_000);
  const payments = useQuery('payment-options', getPaymentOptions, 60_000);
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
  // The form stays mounted (hidden) while the payment is awaited, so a payment that fails brings the shopper back to a form that is still filled in.
  return (
    <>
      <View style={placed ? styles.hidden : styles.screen}>
        <Details delivery={delivery.data} card={payments.data?.card ?? false} items={items} count={count} subtotal={subtotal} onPlaced={setPlaced} />
      </View>
      {placed ? <Waiting placed={placed} onRetryDetails={() => setPlaced(null)} /> : null}
    </>
  );
}

/** An order that has been placed, with the payer to charge and what happened to the first payment prompt. */
interface Placed {
  order: PlacedOrder;
  payer: { network: MomoNetwork; wallet: string } | { card: true };
  prompt: PaymentRequest;
}

function Header({ title = 'Checkout' }: { title?: string }) {
  const styles = useStyles(makeStyles);
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
  card,
  items,
  count,
  subtotal,
  onPlaced,
}: {
  delivery: DeliveryConfig;
  /** The payment provider takes cards. */
  card: boolean;
  items: ReturnType<typeof useBag>['items'];
  count: number;
  subtotal: number;
  onPlaced: (placed: Placed) => void;
}) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const top = useScreenTop();
  const { user, consented, appleAvailable, signInWithApple, signInWithGoogle, recordConsent } = useAuth();
  const [adult, setAdult] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // The sign-in buttons stay tappable; tapping one before the box is ticked says what to do instead of doing nothing.
  const [agreeHint, setAgreeHint] = useState(false);
  async function signInThen(method: () => Promise<boolean>) {
    if (!adult) {
      setAgreeHint(true);
      return;
    }
    setSigningIn(true);
    setError(null);
    try {
      if (await method()) await recordConsent().catch(() => {});
    } catch {
      setError('We couldn’t sign you in. Please try again.');
    } finally {
      setSigningIn(false);
    }
  }
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [area, setArea] = useState('');
  const [directions, setDirections] = useState('');
  const [gps, setGps] = useState('');
  const [optionId, setOptionId] = useState(delivery.options[0]?.id ?? '');
  const [payWith, setPayWith] = useState<'momo' | 'card' | 'cod'>('momo');
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
        setArea((v) => v || a.area);
        setDirections((v) => v || (a.directions ?? ''));
        setGps((v) => v || (a.ghanapost_gps ?? ''));
      }
      const m = method.data as { network: MomoNetwork; wallet_number: string } | null;
      if (m) {
        setNetwork(m.network);
        setWallet((v) => v || m.wallet_number);
      }
    })();
  }, [user]);

  // A window with no fee set can't be priced, so it can't be chosen (otherwise the order is placed and then cancelled at payment).
  const quotes = useMemo(
    () =>
      delivery.options.map((o) => {
        const q = quote(delivery, area, o.id, subtotal);
        return { option: o, q: q.fee === null ? { ...q, available: false } : q };
      }),
    [delivery, area, subtotal],
  );
  const chosen = quotes.find((x) => x.option.id === optionId);
  const fee = chosen?.q.available ? chosen.q.fee : null;
  // Listed areas that match what has been typed; tapping one fills in the exact spelling the store prices by.
  const areaSuggestions = useMemo(() => suggestAreas(delivery, area), [delivery, area]);
  const nothingPriced = area.trim() !== '' && !quotes.some((x) => x.q.available);
  // Any location can be typed. One that isn't on our list is delivered to at the option's standard fee.
  const areaListed = delivery.areas.some((a) => a.name === canonicalArea(delivery, area));

  // Pay on delivery needs a known total, and may be capped by the store.
  const codSetting = delivery.payOnDelivery;
  const total = fee === null ? null : subtotal + fee;
  const codBlocked =
    total === null ? 'Enter your location first.' : codSetting.maxGhs !== null && total > codSetting.maxGhs ? `Available for orders up to ${formatPrice(codSetting.maxGhs)}.` : null;
  const cod = payWith === 'cod' && codSetting.enabled && codBlocked === null;
  const cardPay = payWith === 'card' && card;

  const canPlace = !soldOut && !busy && !!chosen?.q.available;

  async function submit() {
    setError(null);
    if (name.trim().length < 2) return setError('Enter the name of the person receiving the order.');
    if (phone.replace(/\D/g, '').length < 9) return setError('Enter a phone number we can call for delivery.');
    // Shoppers who signed in confirmed this when they created their account; everyone else confirms it here.
    if (!(user && consented) && !adult) return setError('Please accept the terms to continue.');
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Check the email address, or leave it empty.');
    if (!cod && !cardPay && wallet.replace(/\D/g, '').length < 9) return setError('Enter the Mobile Money number you will pay from.');
    setBusy(true);
    try {
      const order = await placeOrder({
        customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, area: canonicalArea(delivery, area), ghanapostGps: gps.trim() || undefined, directions: directions.trim() || undefined, adultConfirmed: !!(user && consented) || adult },
        deliveryOption: optionId,
        payment: cod ? { cod: true } : cardPay ? { card: true } : { network, wallet: wallet.trim() },
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
      const payer = cardPay ? ({ card: true } as const) : { network, wallet: wallet.trim() };
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

        {!(user && consented) ? (
          <Card title={user ? 'One more step' : 'Checkout as guest'}>
            {!user ? (
              <AppText size={13} color={colors.textMuted}>
                You don’t need an account to buy. Fill in your details and pay, or sign in below.
              </AppText>
            ) : null}
            <Checkbox checked={adult} onChange={setAdult}>
              <AppText size={13}>
                I accept the{' '}
                <AppText size={13} weight="semibold" onPress={() => void Linking.openURL(siteAddress('/terms'))}>
                  Terms of Service
                </AppText>{' '}
                and{' '}
                <AppText size={13} weight="semibold" onPress={() => void Linking.openURL(siteAddress('/privacy'))}>
                  Privacy notice
                </AppText>
                .
              </AppText>
            </Checkbox>
            {agreeHint && !adult ? (
              <AppText size={13} weight="semibold" color={colors.danger}>
                Tick the box above first, then sign in.
              </AppText>
            ) : null}
            {!user ? (
              <>
                <AppText weight="bold" size={14}>
                  Or sign in
                </AppText>
                {appleAvailable ? <AppleButton disabled={signingIn} onPress={() => void signInThen(signInWithApple)} /> : null}
                <GoogleButton disabled={signingIn} onPress={() => void signInThen(signInWithGoogle)} />
              </>
            ) : null}
          </Card>
        ) : null}

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
          <Field
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            // Most shoppers pay from the number they gave for delivery, so offer it for Mobile Money once they leave this field.
            onBlur={() => setWallet((v) => v || phone.trim())}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
          <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          <Field label="Location (your area, e.g. East Legon)" value={area} onChangeText={setArea} onBlur={() => setArea((v) => canonicalArea(delivery, v))} autoComplete="postal-address-locality" maxLength={80} />
          {areaSuggestions.length > 0 ? (
            <View style={styles.chips} accessibilityLabel="Matching areas">
              {areaSuggestions.map((name) => (
                <Pressable key={name} onPress={() => setArea(name)} accessibilityRole="button" accessibilityLabel={`Use ${name}`} style={styles.chip}>
                  <AppText size={13} weight="semibold">
                    {name}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
          {nothingPriced ? (
            <Notice>We can’t price delivery to “{area.trim()}” right now. Please contact us and we’ll arrange it.</Notice>
          ) : area.trim() !== '' && !areaListed ? (
            <AppText size={13} color={colors.textMuted}>
              Not on our list? That’s fine: we deliver to your location at the standard rate.
            </AppText>
          ) : null}
          <Field label="Directions (optional)" value={directions} onChangeText={setDirections} multiline />
          <Field label="GhanaPost GPS (optional)" value={gps} onChangeText={setGps} autoCapitalize="characters" />
        </Card>

        <Card title="Delivery">
          <Choices
            label="How soon"
            value={optionId}
            onChange={setOptionId}
            options={quotes.map(({ option, q }) => ({
              id: option.id,
              label: option.label,
              sub: q.available ? `${q.free ? 'Free' : q.fee === null ? 'Fee to be confirmed' : formatPrice(q.fee)} · ${estimate(option, new Date())}` : 'Not available here right now',
              disabled: !q.available,
            }))}
          />
        </Card>

        <Card title="Payment">
          {codSetting.enabled || card ? (
            <Choices
              label="How you pay"
              value={cod ? 'cod' : cardPay ? 'card' : 'momo'}
              onChange={setPayWith}
              options={[
                { id: 'momo', label: 'Mobile Money', sub: 'You confirm on your phone, sometimes with a code first, then your Mobile Money PIN' },
                ...(card ? [{ id: 'card' as const, label: 'Card', sub: 'Visa or Mastercard, on our payment partner’s secure page' }] : []),
                ...(codSetting.enabled
                  ? [{ id: 'cod' as const, label: 'Pay on delivery', sub: codBlocked ?? 'Pay cash to the rider. We call you to confirm first.', disabled: codBlocked !== null }]
                  : []),
              ]}
            />
          ) : null}
          {cod ? (
            <AppText size={13} color={colors.textMuted}>
              We’ll call you to confirm the order before we pack it. Have {total === null ? 'the total' : formatPrice(total)} in cash ready for the rider. Not available for items from independent stores.
            </AppText>
          ) : cardPay ? (
            <AppText size={13} color={colors.textMuted}>
              You’ll enter your card on our payment partner’s secure page. We never see or store your card details.
            </AppText>
          ) : (
            <>
              <Choices label="Network" value={network} onChange={setNetwork} options={momoNetworks.map((n) => ({ id: n.id, label: n.label }))} />
              <Field label="Mobile Money number" value={wallet} onChangeText={setWallet} keyboardType="phone-pad" />
              {phone.trim() && wallet.trim() !== phone.trim() ? (
                <Pressable accessibilityRole="button" onPress={() => setWallet(phone.trim())} style={styles.sameAsPhone}>
                  <AppText size={13} weight="semibold" color={colors.accent}>
                    Use my phone number
                  </AppText>
                </Pressable>
              ) : null}
            </>
          )}
          <Field label="Promo code (optional)" value={promo} onChangeText={setPromo} autoCapitalize="characters" />
        </Card>


        <Card>
          <Row label="Subtotal" value={formatPrice(subtotal)} />
          <Row label="Delivery" value={fee === null ? 'To be confirmed' : fee === 0 ? 'Free' : formatPrice(fee)} />
          {promo.trim() ? <Row label={`Promo code ${promo.trim()}`} value="Taken off when you order" /> : null}
          <Row label={promo.trim() ? 'Total before promo code' : 'Total'} value={fee === null ? 'To be confirmed' : formatPrice(subtotal + fee)} bold />
          <AppText size={12} color={colors.textMuted}>
            {promo.trim()
              ? 'We check your promo code when you place the order. The exact amount to pay is shown on the next step, and nothing is charged until you approve it.'
              : 'The exact amount to pay is shown on the next step, and nothing is charged until you approve it.'}
          </AppText>
        </Card>

        {soldOut && <Notice>Something in your bag is sold out. Remove it in your bag to continue.</Notice>}
        {error && <Notice>{error}</Notice>}
      </ScrollView>
      <BottomBar>
        <Button label={busy ? 'Placing your order…' : cod ? 'Place order, pay on delivery' : cardPay ? 'Place order and pay by card' : 'Place order and pay'} onPress={() => void submit()} disabled={!canPlace} busy={busy} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
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
  const colors = useColors();
  const styles = useStyles(makeStyles);
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

  // With the payment partner's own page, the shopper pays there: open it once, and again on request.
  const checkoutUrl = prompt.kind === 'requested' ? prompt.checkoutUrl : undefined;
  const opened = useRef(false);
  useEffect(() => {
    if (checkoutUrl && !opened.current) {
      opened.current = true;
      void openPaymentPage(checkoutUrl);
    }
  }, [checkoutUrl]);

  const until = new Date(order.reservedUntil).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' });

  return (
    <View style={[styles.screen, { paddingTop: top, paddingHorizontal: 20, gap: 16 }]}>
      <View style={styles.titleRow}>
        <BackButton fallback="/bag" />
        <AppText weight="semibold" size={22} accessibilityRole="header">
          {outcome === 'lapsed' ? 'Payment didn’t go through' : checkoutUrl ? 'Complete the payment' : 'Approve the payment'}
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
              {checkoutUrl
                ? 'Finish paying on our payment partner’s page. You may be asked for a code we send to your phone, then your Mobile Money PIN. This screen updates by itself once the payment goes through.'
                : 'Check your phone and approve the Mobile Money prompt. This screen updates by itself.'}
            </AppText>
            {checkoutUrl ? <Button label="Open the payment page" onPress={() => void openPaymentPage(checkoutUrl)} /> : null}
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

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingBottom: 130, gap: 16 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 6 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hidden: { display: 'none' },
  sameAsPhone: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.canvas },
});
