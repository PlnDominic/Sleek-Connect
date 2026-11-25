import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance, type TextInputInstance } from 'react-native';
import { canonicalArea, estimate, formatPrice, momoNetworks, quote, suggestAreas, type DeliveryConfig, type MomoNetwork } from '@sleek/shared';
import { purchaseUnits, useBag } from '@sleek/shared/bag';
import { AppleButton, GoogleButton } from '@/components/SocialButtons';
import { AppText } from '@/components/AppText';
import { Button, Card, Checkbox, Choices, Field, Notice } from '@/components/Form';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { BackButton, BottomBar, useScreenTop } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { bagLineChanges, refreshBagLines } from '@/lib/bag-checkout';
import { markPurchasePaid, rememberPurchase } from '@/lib/bag-purchases';
import { readDeliveryArea, rememberDeliveryArea } from '@/lib/delivery-area';
import { getDeliveryConfig, getPaymentOptions, notifyCodOrder, openPaymentPage, placeOrder, requestPayment, selectDeliveryQuote, type PaymentOptions, type PaymentRequest, type PlacedOrder } from '@/lib/checkout';
import { checkoutPaymentState, getOrderStatus, rememberOrder } from '@/lib/orders';
import { registerForPush } from '@/lib/push';
import { siteAddress } from '@/lib/site';
import { useQuery, type QueryResult } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { useColors, useStyles, type Palette } from '@/theme/theme';

const POLL_MS = 3000;

interface SavedAddress {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string;
  area: string | null;
  ghanapost_gps: string | null;
  directions: string | null;
}

/** Details, delivery and Mobile Money in one screen; then waits for the shopper to approve the prompt on their phone. */
export default function CheckoutScreen() {
  const styles = useStyles(makeStyles);
  const top = useScreenTop();
  const { items, count, subtotal, ready } = useBag();
  const delivery = useQuery('delivery-config', getDeliveryConfig, 5 * 60_000);
  const payments = useQuery('payment-options', getPaymentOptions, 60_000);
  const [placed, setPlaced] = useState<Placed | null>(null);

  if (ready && items.length === 0 && !placed) {
    return (
      <View style={[styles.screen, { paddingTop: top, paddingHorizontal: 20 }]}>
        <Header />
        <EmptyState icon="bag" title="Your bag is empty" message="Add something to your bag first." action={{ label: 'Start shopping', onPress: () => router.replace('/shop') }} />
      </View>
    );
  }
  if (!delivery.data || !ready) {
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
        <Details delivery={delivery.data} payments={payments} items={items} count={count} subtotal={subtotal} onPlaced={setPlaced} />
      </View>
      {placed ? <Waiting placed={placed} onRetryDetails={() => setPlaced(null)} /> : null}
    </>
  );
}

/** An order that has been placed, with the payer to charge and what happened to the first payment prompt. */
interface Placed {
  order: PlacedOrder;
  payer: { network: MomoNetwork; wallet: string } | { card: true };
  prompt: PaymentRequest | null;
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
  payments,
  items,
  count,
  subtotal,
  onPlaced,
}: {
  delivery: DeliveryConfig;
  payments: QueryResult<PaymentOptions>;
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
  const [area, setArea] = useState(readDeliveryArea);
  const [directions, setDirections] = useState('');
  const [gps, setGps] = useState('');
  const [preferredOption, setPreferredOption] = useState('');
  const [payWith, setPayWith] = useState<'momo' | 'card' | 'cod'>('momo');
  const [network, setNetwork] = useState<MomoNetwork>('mtn');
  const [wallet, setWallet] = useState('');
  const { replaceDetails, removePurchased } = useBag();
  const [promo, setPromo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const soldOut = items.some((i) => i.inStock === false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [saveAddress, setSaveAddress] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'phone' | 'email' | 'area' | 'wallet' | 'terms', string>>>({});
  const nameInput = useRef<TextInputInstance>(null);
  const phoneInput = useRef<TextInputInstance>(null);
  const emailInput = useRef<TextInputInstance>(null);
  const areaInput = useRef<TextInputInstance>(null);
  const walletInput = useRef<TextInputInstance>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const editedAddress = useRef(false);
  const submitting = useRef(false);

  function chooseAddress(id: string) {
    editedAddress.current = true;
    setSelectedAddress(id);
    setSaveAddress(false);
    setFieldErrors({});
    const address = addresses.find((entry) => entry.id === id);
    setName(address?.recipient_name ?? '');
    setPhone(address?.phone ?? '');
    setArea(address?.area ?? readDeliveryArea());
    setDirections(address?.directions ?? '');
    setGps(address?.ghanapost_gps ?? '');
    if (address?.area) rememberDeliveryArea(address.area);
  }

  // Signed-in shoppers start with their saved address and Mobile Money number.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const [address, method] = await Promise.all([
        supabase
          .from('customer_addresses')
          .select('id, label, recipient_name, phone, area, ghanapost_gps, directions')
          .order('is_default', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(20),
        supabase.from('saved_payment_methods').select('network, wallet_number').order('is_default', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      const saved = (address.data ?? []) as SavedAddress[];
      setAddresses(saved);
      const a = saved[0];
      const preferredArea = readDeliveryArea();
      if (a && !editedAddress.current && (!preferredArea || preferredArea === a.area)) {
        setSelectedAddress(a.id);
        setName((v) => v || a.recipient_name);
        setPhone((v) => v || a.phone);
        setArea((v) => v || a.area || '');
        setDirections((v) => v || (a.directions ?? ''));
        setGps((v) => v || (a.ghanapost_gps ?? ''));
      }
      const m = method.data as { network: MomoNetwork; wallet_number: string } | null;
      if (m) {
        if (!editedAddress.current) {
          setNetwork(m.network);
          setWallet((v) => v || m.wallet_number);
        }
      }
    })();
    return () => { cancelled = true; };
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
  const chosen = selectDeliveryQuote(quotes, preferredOption);
  const optionId = chosen?.option.id ?? '';
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
  const online = payments.data?.online === true && !payments.error && !payments.refreshing;
  const card = online && payments.data?.card === true;
  const cardPay = payWith === 'card' && card;
  const paymentReady = cod || (online && (payWith === 'momo' || cardPay));

  const canPlace = !soldOut && !busy && !!chosen && paymentReady;

  async function submit() {
    if (!canPlace || submitting.current) return;
    setError(null);
    const errors: typeof fieldErrors = {};
    if (!(user && consented) && !adult) errors.terms = 'Accept the terms to continue.';
    if (name.trim().length < 2) errors.name = 'Enter the name of the person receiving the order.';
    if (phone.replace(/\D/g, '').length < 9) errors.phone = 'Enter a phone number we can call for delivery.';
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) errors.email = 'Check the email address, or leave it empty.';
    if (area.trim().length < 2) errors.area = 'Enter the area where you want delivery.';
    if (!cod && !cardPay && wallet.replace(/\D/g, '').length < 9) errors.wallet = 'Enter the Mobile Money number you will pay from.';
    setFieldErrors(errors);
    if (errors.terms) return scroll.current?.scrollTo({ y: 0 });
    const first = errors.name ? nameInput : errors.phone ? phoneInput : errors.email ? emailInput : errors.area ? areaInput : errors.wallet ? walletInput : null;
    if (first) return first.current?.focus();
    submitting.current = true;
    setBusy(true);
    try {
      const latest = await refreshBagLines(items);
      const changes = bagLineChanges(items, latest);
      if (changes.length) {
        replaceDetails(latest);
        setError(changes.map((line) => line.unavailable ? `${line.name} is unavailable. Remove it from your bag to continue.` : `${line.name} is now ${formatPrice(line.price)}. Check your updated total and continue when ready.`).join('\n'));
        return;
      }
      rememberDeliveryArea(canonicalArea(delivery, area));
      const order = await placeOrder({
        customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, area: canonicalArea(delivery, area), ghanapostGps: gps.trim() || undefined, directions: directions.trim() || undefined, adultConfirmed: !!(user && consented) || adult },
        deliveryOption: optionId,
        payment: cod ? { cod: true } : cardPay ? { card: true } : { network, wallet: wallet.trim() },
        items: items.map((i) => ({ slug: i.slug, size: i.sizeId, quantity: i.qty })),
        promoCode: promo,
        saveAddress: Boolean(user && saveAddress),
      });
      rememberOrder({ token: order.orderToken, orderNumber: order.orderNumber });
      // Asking now is the moment shoppers expect updates; "no" never blocks the order.
      void registerForPush(order.orderToken);
      if (cod) {
        // Nothing to charge: staff call to confirm, and the rider collects the cash.
        void notifyCodOrder(order.orderToken);
        removePurchased(items.flatMap(purchaseUnits));
        router.replace({ pathname: '/orders/[token]', params: { token: order.orderToken } });
        return;
      }
      rememberPurchase(order.orderToken, items);
      const payer = cardPay ? ({ card: true } as const) : { network, wallet: wallet.trim() };
      onPlaced({ order, payer, prompt: null });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t place your order. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={[styles.content, { paddingTop: top }]} keyboardShouldPersistTaps="handled">
        <Header />

        {payments.loading || payments.refreshing ? (
          <AppText size={13} color={colors.textMuted} accessibilityLiveRegion="polite">Checking payment options…</AppText>
        ) : !online ? (
          <>
            <Notice>{payments.error ? 'We couldn’t check payment options. Your checkout details are still here.' : 'Online payments are temporarily unavailable.'}</Notice>
            <Button label="Check payment options again" kind="secondary" onPress={() => void payments.refetch()} />
          </>
        ) : null}
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
            {fieldErrors.terms && <Notice>{fieldErrors.terms}</Notice>}
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
          {user && addresses.length > 0 && (
            <Choices label="Delivery address" value={selectedAddress} onChange={chooseAddress} options={[
              ...addresses.map((address) => ({ id: address.id, label: address.label || address.recipient_name, sub: address.area ?? undefined })),
              { id: '', label: 'Use a new address' },
            ]} />
          )}
          <Field label="Full name" inputRef={nameInput} error={fieldErrors.name} value={name} onChangeText={(value) => { editedAddress.current = true; setName(value); setFieldErrors((current) => ({ ...current, name: undefined })); }} autoComplete="name" textContentType="name" />
          <Field
            label="Phone number"
            inputRef={phoneInput}
            error={fieldErrors.phone}
            value={phone}
            onChangeText={(value) => { editedAddress.current = true; setPhone(value); setFieldErrors((current) => ({ ...current, phone: undefined })); }}
            // Most shoppers pay from the number they gave for delivery, so offer it for Mobile Money once they leave this field.
            onBlur={() => setWallet((v) => v || phone.trim())}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
          <Field label="Email (optional)" inputRef={emailInput} error={fieldErrors.email} value={email} onChangeText={(value) => { setEmail(value); setFieldErrors((current) => ({ ...current, email: undefined })); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          <Field label="Location (your area, e.g. East Legon)" inputRef={areaInput} error={fieldErrors.area} value={area} onChangeText={(value) => { editedAddress.current = true; setArea(value); setFieldErrors((current) => ({ ...current, area: undefined })); }} onBlur={() => setArea((v) => canonicalArea(delivery, v))} autoComplete="postal-address-locality" maxLength={80} />
          {areaSuggestions.length > 0 ? (
            <View style={styles.chips} accessibilityLabel="Matching areas">
              {areaSuggestions.map((name) => (
                <Pressable key={name} onPress={() => { editedAddress.current = true; setArea(name); setFieldErrors((current) => ({ ...current, area: undefined })); }} accessibilityRole="button" accessibilityLabel={`Use ${name}`} style={styles.chip}>
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
          <Field label="Directions (optional)" value={directions} onChangeText={(value) => { editedAddress.current = true; setDirections(value); }} multiline />
          <Field label="GhanaPost GPS (optional)" value={gps} onChangeText={(value) => { editedAddress.current = true; setGps(value); }} autoCapitalize="characters" />
          {user && !selectedAddress && <Checkbox checked={saveAddress} onChange={setSaveAddress}><AppText>Save this address for next time</AppText></Checkbox>}
        </Card>

        <Card title="Delivery">
          <Choices
            label="How soon"
            value={optionId}
            onChange={setPreferredOption}
            options={quotes.map(({ option, q }) => ({
              id: option.id,
              label: option.label,
              sub: q.available ? `${q.free ? 'Free' : q.fee === null ? 'Fee to be confirmed' : formatPrice(q.fee)} · ${estimate(option, new Date())}` : 'Not available here right now',
              disabled: !q.available,
            }))}
          />
        </Card>

        <Card title="Payment">
          {online && payWith === 'card' && !card ? (
            <>
              <Notice>Card payment is currently unavailable.</Notice>
              <Button label="Switch to Mobile Money" kind="secondary" onPress={() => setPayWith('momo')} />
            </>
          ) : null}
          {codSetting.enabled || card ? (
            <Choices
              label="How you pay"
              value={payWith}
              onChange={setPayWith}
              options={[
                { id: 'momo', label: 'Mobile Money', sub: 'You confirm on your phone, sometimes with a code first, then your Mobile Money PIN', disabled: !online },
                ...(card ? [{ id: 'card' as const, label: 'Card', sub: 'Visa or Mastercard, on our payment partner’s secure page' }] : []),
                ...(codSetting.enabled
                  ? [{ id: 'cod' as const, label: 'Pay on delivery', sub: codBlocked ?? 'Pay cash to the rider. We call you to confirm first.', disabled: codBlocked !== null }]
                  : []),
              ]}
            />
          ) : null}
          {cod ? (
            <AppText size={13} color={colors.textMuted}>
              We’ll call you to confirm the order before we pack it. Have {total === null ? 'the total' : formatPrice(total)} in cash ready for the rider.
            </AppText>
          ) : cardPay ? (
            <AppText size={13} color={colors.textMuted}>
              You’ll enter your card on our payment partner’s secure page. We never see or store your card details.
            </AppText>
          ) : online && payWith === 'momo' ? (
            <>
              <Choices label="Network" value={network} onChange={setNetwork} options={momoNetworks.map((n) => ({ id: n.id, label: n.label }))} />
              <Field label="Mobile Money number" inputRef={walletInput} error={fieldErrors.wallet} value={wallet} onChangeText={(value) => { setWallet(value); setFieldErrors((current) => ({ ...current, wallet: undefined })); }} keyboardType="phone-pad" />
              {phone.trim() && wallet.trim() !== phone.trim() ? (
                <Pressable accessibilityRole="button" onPress={() => setWallet(phone.trim())} style={styles.sameAsPhone}>
                  <AppText size={13} weight="semibold" color={colors.accent}>
                    Use my phone number
                  </AppText>
                </Pressable>
              ) : null}
            </>
          ) : null}
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
        <Button label={busy ? 'Checking your order…' : cod ? 'Place order, pay on delivery' : 'Review order total'} onPress={() => void submit()} disabled={!canPlace} busy={busy} />
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
  const [prompt, setPrompt] = useState(placed.prompt);
  const [sending, setSending] = useState(false);
  const lookup = useCallback(() => getOrderStatus(order.orderToken), [order.orderToken]);
  const { data, refetch, refreshing, loading, error } = useQuery(`payment-status:${order.orderToken}`, lookup, 0);
  const outcome = checkoutPaymentState(data);

  useEffect(() => {
    if (outcome === 'confirmed') {
      markPurchasePaid(order.orderToken);
      router.replace({ pathname: '/orders/[token]', params: { token: order.orderToken } });
    }
    if (outcome === 'confirmed' || outcome === 'expired') return;
    const timer = setInterval(() => void refetch(), POLL_MS);
    return () => clearInterval(timer);
  }, [order.orderToken, outcome, refetch]);

  const checkoutUrl = prompt?.kind === 'requested' ? prompt.checkoutUrl : undefined;
  const opened = useRef(false);
  useEffect(() => {
    if (checkoutUrl && !opened.current && outcome === 'waiting') {
      opened.current = true;
      void openPaymentPage(checkoutUrl);
    }
  }, [checkoutUrl, outcome]);

  async function send() {
    if (sending || error || data?.status !== 'pending_payment' || data.paymentStatus !== null) return;
    setSending(true);
    try {
      setPrompt(await requestPayment(order.orderToken, payer));
      await refetch();
    } finally {
      setSending(false);
    }
  }

  const until = new Date(order.reservedUntil).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' });
  const verifying = outcome === 'verifying' || outcome === 'review';
  const canSend = !error && data?.status === 'pending_payment' && data.paymentStatus === null;

  return (
    <View style={[styles.screen, { paddingTop: top, paddingHorizontal: 20, gap: 16 }]}>
      <View style={styles.titleRow}>
        <BackButton fallback="/bag" />
        <AppText weight="semibold" size={22} accessibilityRole="header">
          {outcome === 'expired' ? 'Order expired' : verifying ? 'Checking your payment' : !prompt ? 'Review your total' : 'Complete the payment'}
        </AppText>
      </View>
      <Card>
        <AppText weight="bold" size={15}>
          Order {order.orderNumber}
          {order.total !== null ? ` · ${formatPrice(order.total)}` : ''}
        </AppText>
        {outcome === 'expired' ? (
          <>
            <AppText size={14} color={colors.textMuted}>
              The hold expired before payment started. Your bag is still here and you can return to checkout.
            </AppText>
            <Button label="Back to checkout" onPress={onRetryDetails} />
          </>
        ) : verifying ? (
          <Notice>
            {outcome === 'review'
              ? 'We received your payment and are checking it. Contact us with your order number if you need help.'
              : 'The item hold ended while we were waiting for your payment status. If you approved a payment, check this order or contact us before trying again.'}
          </Notice>
        ) : !prompt ? (
          <>
            <Row label="Subtotal" value={formatPrice(order.subtotal)} />
            <Row label="Delivery" value={order.deliveryFee === null ? 'To be confirmed' : order.deliveryFee === 0 ? 'Free' : formatPrice(order.deliveryFee)} />
            {order.discount > 0 && <Row label="Discount" value={`−${formatPrice(order.discount)}`} />}
            <AppText size={13} color={colors.textMuted}>We are holding your items until {until}.</AppText>
            <Button label={order.total === null ? 'Continue to payment' : `Pay ${formatPrice(order.total)}`} onPress={() => void send()} busy={sending} disabled={!canSend} />
          </>
        ) : prompt.kind === 'requested' ? (
          <>
            <AppText size={14} color={colors.textMuted}>
              {checkoutUrl
                ? 'Finish paying on our payment partner’s page. This screen updates by itself once the payment goes through.'
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
            {canSend && <Button label="Try payment for this order" kind="secondary" busy={sending} onPress={() => void send()} />}
          </>
        )}
        {error && <Notice>We couldn’t check the payment status. Check your connection and try again.</Notice>}
        {outcome !== 'expired' && (
          <Button label="Check payment status" kind="secondary" busy={loading || refreshing} onPress={() => void refetch()} />
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
