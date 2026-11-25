import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { buildTimeline, expectedDelivery, finalStatuses, formatPrice, formatPriceOr, momoNetworks, networkNames, payOnDeliveryLabels, statusLabels, trackingProgress, trackingStages, type IconName, type MomoNetwork } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Button, Card, Choices, Field, Notice } from '@/components/Form';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { Icon } from '@/components/Icon';
import { Reveal, useReduceMotion, usePulse } from '@/components/motion';
import { BackButton, IconButton, useScreenTop } from '@/components/ui';
import { ProductImage } from '@/components/ProductImage';
import { getAllProducts } from '@/lib/catalog';
import { getDeliveryConfig, getPaymentOptions, openPaymentPage, requestPayment } from '@/lib/checkout';
import { cancelOrder, checkoutPaymentState, formatDate, formatDateTime, getOrder, getOrderStatus, rememberOrder, type CustomerOrder } from '@/lib/orders';
import { useAuth } from '@/lib/auth';
import { pushAllowed, registerForPush } from '@/lib/push';
import { useQuery } from '@/lib/query';
import { openSite } from '@/lib/site';
import { useColors, useStyles, type Palette } from '@/theme/theme';

const REFRESH_MS = 15_000;
const RECONCILIATION_MS = 3 * 24 * 60 * 60_000;

export default function OrderScreen() {
  const styles = useStyles(makeStyles);
  const { token } = useLocalSearchParams<{ token: string }>();
  const top = useScreenTop();
  const lookup = useCallback(() => getOrder(token), [token]);
  const lookupPayment = useCallback(() => getOrderStatus(token), [token]);
  const { data: order, error, loading, refetch } = useQuery(token ? `order:${token}` : null, lookup, 5_000);
  const paymentOpen = !!order && order.payment_method !== 'cod' && !order.paid_at &&
    (order.status === 'pending_payment' || order.status === 'cancelled');
  const payment = useQuery(paymentOpen ? `payment-status:${token}` : null, lookupPayment, 0);
  const { refetch: refetchPayment } = payment;
  const refresh = useCallback(async () => {
    await Promise.all([refetch(), refetchPayment()]);
  }, [refetch, refetchPayment]);
  const paymentState = checkoutPaymentState(payment.data);
  const paymentWindowEnd = paymentOpen && paymentState !== 'expired'
    ? new Date(order.created_at).getTime() + RECONCILIATION_MS
    : 0;

  // Follows the order while it is still moving.
  const finished = order ? finalStatuses.includes(order.status) : false;
  useEffect(() => {
    if (!token || (finished && Date.now() >= paymentWindowEnd)) return;
    const timer = setInterval(() => {
      if (finished && Date.now() >= paymentWindowEnd) clearInterval(timer);
      else void refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [token, finished, paymentWindowEnd, refresh]);

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
  const checkingPayment = paymentOpen && (paymentState === 'verifying' || paymentState === 'review' ||
    payment.loading || Boolean(payment.error) ||
    order.status === 'pending_payment' && Boolean(payment.data?.paymentStatus));
  return <OrderView
    order={order}
    token={token}
    onChanged={() => void refresh()}
    checkingPayment={checkingPayment}
    paymentReceived={paymentState === 'review'}
    canStartPayment={paymentOpen && payment.data?.status === 'pending_payment' && payment.data.paymentStatus === null && !payment.error}
    checkingStatus={payment.loading || payment.refreshing}
  />;
}

function Header({ title = 'Your order' }: { title?: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.titleRow}>
      <BackButton fallback="/orders" />
      <AppText weight="semibold" size={22} accessibilityRole="header">
        {title}
      </AppText>
    </View>
  );
}

const stageIcons: IconName[] = ['clipboard', 'box', 'truck', 'home'];

/** Confirmed → Packed → On the way → Delivered: the line fills in when the screen opens, and the current step breathes. */
function Journey({ status }: { status: CustomerOrder['status'] }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const reduce = useReduceMotion();
  const { done, current, problem } = trackingProgress(status);
  const [progress] = useState(() => new Animated.Value(0));
  const pulse = usePulse(current !== null && !problem);
  const tint = problem ? colors.gold : colors.accent;

  useEffect(() => {
    if (reduce) return progress.setValue(done);
    Animated.timing(progress, { toValue: done, duration: 300 + done * 450, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [done, progress, reduce]);

  return (
    <View accessible accessibilityLabel={`Progress: ${done} of ${trackingStages.length} steps done`}>
      <View style={styles.journeyRow}>
        {trackingStages.map((stage, i) => {
          const isDone = i < done;
          const isCurrent = i === current;
          const fill = progress.interpolate({ inputRange: [i - 0.35, i], outputRange: [0, 1], extrapolate: 'clamp' });
          return (
            <View key={stage} style={styles.journeyCell}>
              <View style={styles.nodeWrap}>
                {i > 0 && (
                  <View style={styles.connectorIn}>
                    <View style={styles.connectorTrack} />
                    <Animated.View style={[styles.connectorFill, { backgroundColor: tint, transform: [{ scaleX: progress.interpolate({ inputRange: [i - 1, i], outputRange: [0, 1], extrapolate: 'clamp' }) }] }]} />
                  </View>
                )}
                {isCurrent && <Animated.View style={[styles.ring, { backgroundColor: tint }, pulse]} />}
                <View style={[styles.node, isCurrent && { borderColor: tint }]}>
                  <Icon name={stageIcons[i] ?? 'box'} size={16} color={isCurrent ? tint : colors.textMuted} strokeWidth={2} />
                  {isDone && (
                    <Animated.View style={[styles.nodeDone, { backgroundColor: tint, opacity: fill, transform: [{ scale: fill }] }]}>
                      <View style={styles.tick} />
                    </Animated.View>
                  )}
                </View>
              </View>
              <AppText size={11} weight={isCurrent ? 'bold' : isDone ? 'semibold' : 'regular'} color={isDone || isCurrent ? colors.ink : colors.textMuted} style={styles.stageLabel} numberOfLines={1}>
                {stage}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The delivery code as four tiles that pop in one after another. */
function CodeTiles({ code }: { code: string }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const reduce = useReduceMotion();
  const digits = code.split('');
  const [pops] = useState(() => digits.map(() => new Animated.Value(0)));
  useEffect(() => {
    if (reduce) return pops.forEach((v) => v.setValue(1));
    Animated.stagger(90, pops.map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }))).start();
  }, [pops, reduce]);
  return (
    <View style={styles.codeRow} accessible accessibilityLabel={`Delivery code ${digits.join(' ')}`}>
      {digits.map((d, i) => (
        <Animated.View key={i} style={[styles.codeTile, { opacity: pops[i] ?? 1, transform: [{ scale: pops[i]?.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) ?? 1 }] }]}>
          <AppText weight="bold" size={30} color={colors.canvas}>
            {d}
          </AppText>
        </Animated.View>
      ))}
    </View>
  );
}

/** A small tinted icon with a title and a line of detail, for the details card. */
function InfoRow({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon name={icon} size={18} color={colors.accent} strokeWidth={2} />
      </View>
      <View style={styles.flex}>
        <AppText weight="semibold" size={14}>
          {title}
        </AppText>
        <AppText size={13} color={colors.textMuted}>
          {text}
        </AppText>
      </View>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  return (
    <AppText weight="bold" size={12} color={colors.textMuted} style={styles.sectionTitle} accessibilityRole="header">
      {children.toUpperCase()}
    </AppText>
  );
}

function OrderView({ order, token, onChanged, checkingPayment, paymentReceived, canStartPayment, checkingStatus }: {
  order: CustomerOrder;
  token: string;
  onChanged: () => void;
  checkingPayment: boolean;
  paymentReceived: boolean;
  canStartPayment: boolean;
  checkingStatus: boolean;
}) {
  const colors = useColors();
  const { user, loading: authLoading } = useAuth();
  const styles = useStyles(makeStyles);
  const top = useScreenTop();
  const [scrollY] = useState(() => new Animated.Value(0));
  const delivery = useQuery('delivery-config', getDeliveryConfig, 5 * 60_000);
  const catalogue = useQuery('products:all', getAllProducts);
  const bySlug = new Map((catalogue.data ?? []).map((p) => [p.slug, p]));
  const progress = trackingProgress(order.status);
  const timeline = buildTimeline(order);
  const payOnDelivery = order.payment_method === 'cod';
  const dispatchFrom = order.paid_at ?? order.cod_confirmed_at;
  const arrival = dispatchFrom ? expectedDelivery(delivery.data?.options.find((o) => o.id === order.delivery_option), dispatchFrom) : null;
  const [notifying, setNotifying] = useState<'unknown' | 'on' | 'off'>('unknown');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const headerHeight = top + 44;
  const heroPulse = usePulse(progress.current !== null && !progress.problem);
  const statusIcon: IconName = order.status === 'delivered' ? 'smile' : progress.problem ? 'alert' : stageIcons[progress.current ?? 3] ?? 'box';
  const statusTint = progress.problem ? colors.gold : colors.accent;

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

  // Scroll-linked motion: the big title fades and lifts away, the glass bar and its small title arrive, the hero drifts slower than the page.
  const titleOpacity = scrollY.interpolate({ inputRange: [0, 60], outputRange: [1, 0], extrapolate: 'clamp' });
  const titleShift = scrollY.interpolate({ inputRange: [-120, 0, 60], outputRange: [14, 0, -12], extrapolate: 'clamp' });
  const titleScale = scrollY.interpolate({ inputRange: [-120, 0], outputRange: [1.08, 1], extrapolate: 'clamp' });
  const barOpacity = scrollY.interpolate({ inputRange: [24, 74], outputRange: [0, 1], extrapolate: 'clamp' });
  const heroShift = scrollY.interpolate({ inputRange: [0, 300], outputRange: [0, 40], extrapolate: 'clamp' });
  const heroScale = scrollY.interpolate({ inputRange: [-150, 0, 300], outputRange: [1.06, 1, 0.97], extrapolate: 'clamp' });

  const payment =
    order.payment_method === 'cod'
      ? 'Pay on delivery (cash)'
      : order.payment_method === 'card'
        ? 'Card'
        : `${order.momo_network ? networkNames[order.momo_network] : 'Mobile Money'}${order.wallet_ending ? `, wallet ending ${order.wallet_ending}` : ''}`;
  let reveal = 0;

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + 6 }]}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <Animated.View style={[styles.largeTitle, { opacity: titleOpacity, transform: [{ translateY: titleShift }, { scale: titleScale }] }]}>
          <AppText weight="bold" size={32} accessibilityRole="header" style={styles.bigTitle}>
            Order {order.order_number}
          </AppText>
          <AppText size={14} color={colors.textMuted}>
            Placed {formatDate(order.created_at)}
          </AppText>
        </Animated.View>

        {/* Hero: where the order is, in one glance. */}
        <Reveal scrollY={scrollY} index={reveal++}>
          <Animated.View style={[styles.hero, { transform: [{ translateY: heroShift }, { scale: heroScale }] }]}>
            <View style={styles.heroTop}>
              <View style={styles.heroIconWrap}>
                {progress.current !== null && !progress.problem && <Animated.View style={[styles.heroRing, { backgroundColor: statusTint }, heroPulse]} />}
                <View style={[styles.heroIcon, { backgroundColor: statusTint + '22' }]}>
                  <Icon name={statusIcon} size={26} color={statusTint} strokeWidth={2} />
                </View>
              </View>
              <View style={styles.flex}>
                <AppText weight="bold" size={22} style={styles.heroTitle}>
                  {checkingPayment ? 'Checking your payment' : (payOnDelivery && payOnDeliveryLabels[order.status]) || statusLabels[order.status]}
                </AppText>
                {arrival && order.status !== 'delivered' && order.status !== 'cancelled' && order.status !== 'returned' ? (
                  <AppText size={14} color={colors.textMuted}>
                    Expected {arrival}
                  </AppText>
                ) : null}
                {order.status === 'delivered' && order.delivered_at ? (
                  <AppText size={14} color={colors.textMuted}>
                    {formatDateTime(order.delivered_at)}
                  </AppText>
                ) : null}
              </View>
            </View>
            {!checkingPayment && <Journey status={order.status} />}
            {!checkingPayment && progress.problem ? <Notice>{progress.problem}</Notice> : null}
          </Animated.View>
        </Reveal>

        {checkingPayment && (
          <Reveal scrollY={scrollY} index={reveal++}>
            <Card title="Payment status">
              <Notice>
                {paymentReceived
                  ? 'We received your payment and are checking it. Contact us with your order number if you need help.'
                  : 'If you approved a payment, check this order or contact us before trying again.'}
              </Notice>
              <Button label="Check payment status" kind="secondary" busy={checkingStatus} onPress={onChanged} />
            </Card>
          </Reveal>
        )}
        {canStartPayment && (
          <Reveal scrollY={scrollY} index={reveal++}>
            <PayAgain token={token} reservedUntil={order.reserved_until} onChanged={onChanged} />
          </Reveal>
        )}
        {payOnDelivery && ['pending_payment', 'paid', 'packing', 'packed', 'out_for_delivery'].includes(order.status) ? (
          <Reveal scrollY={scrollY} index={reveal++}>
            <Card title="Pay on delivery">
              <AppText size={14}>
                {order.status === 'pending_payment' ? 'We’ll call you to confirm this order. ' : ''}
                Pay {formatPriceOr(order.total_ghs, 'the total')} in cash to the rider when it arrives.
              </AppText>
            </Card>
          </Reveal>
        ) : null}

        {order.status === 'out_for_delivery' && order.delivery_code ? (
          <Reveal scrollY={scrollY} index={reveal++}>
            <View style={styles.codeCard}>
              <View style={styles.codeHead}>
                <Icon name="lockKeyhole" size={16} color={colors.canvas} strokeWidth={2} />
                <AppText weight="bold" size={12} color={colors.canvas} style={styles.codeEyebrow}>
                  YOUR DELIVERY CODE
                </AppText>
              </View>
              <CodeTiles code={order.delivery_code} />
              <AppText size={13} color={colors.canvas} style={styles.codeNote}>
                Give this code to the rider only when you have your order in hand.
                {order.rider ? ` Your rider is ${order.rider.name} (${order.rider.vehicle}).` : ''}
                {order.courier_reference ? ` Courier reference: ${order.courier_reference}.` : ''}
              </AppText>
            </View>
          </Reveal>
        ) : null}

        {!user && !authLoading ? (
          <Reveal scrollY={scrollY} index={reveal++}>
            <Card title="Want it quicker next time?">
              <AppText size={13} color={colors.textMuted}>
                Save your delivery details and see all your orders on every phone. It takes a few seconds.
              </AppText>
              <Button label="Save my details" kind="secondary" onPress={() => router.push('/account')} />
            </Card>
          </Reveal>
        ) : null}

        <Reveal scrollY={scrollY} index={reveal++}>
          <SectionTitle>{`Items · ${order.items.length}`}</SectionTitle>
          <View style={styles.group}>
            {order.items.map((item, i) => (
              <View key={item.id} style={[styles.itemRow, i > 0 && styles.hairlineTop]}>
                <Pressable
                  accessibilityRole={item.slug ? 'link' : undefined}
                  accessibilityLabel={`${item.name}, view product`}
                  disabled={!item.slug}
                  onPress={() => item.slug && router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })}
                  style={styles.thumbWrap}
                >
                  {(() => {
                    const product = item.slug ? bySlug.get(item.slug) : undefined;
                    return product ? (
                      <ProductImage image={product.image} photo={product.photos?.[0]?.url} tint={product.tint} kind={product.kind} style={styles.thumb} iconSize={22} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty]}>
                        <Icon name="bag" size={22} color={colors.textMuted} />
                      </View>
                    );
                  })()}
                  <View style={styles.qtyBadge}>
                    <AppText weight="bold" size={11} color={colors.canvas}>
                      ×{item.quantity}
                    </AppText>
                  </View>
                </Pressable>
                <View style={styles.flex}>
                  <AppText weight="semibold" size={14} numberOfLines={2}>
                    {item.name}
                  </AppText>
                  {item.size_label ? (
                    <AppText size={12} color={colors.textMuted}>
                      {item.size_label}
                    </AppText>
                  ) : null}
                </View>
                <AppText weight="bold" size={14}>
                  {formatPrice(item.line_total_ghs)}
                </AppText>
              </View>
            ))}
            <View style={[styles.totals, styles.hairlineTop]}>
              <Total label="Subtotal" value={formatPrice(order.subtotal_ghs)} />
              <Total label="Delivery" value={order.delivery_fee_ghs === null ? 'To be confirmed' : order.delivery_fee_ghs === 0 ? 'Free' : formatPrice(order.delivery_fee_ghs)} />
              <View style={styles.grand}>
                <Total label="Total" value={formatPriceOr(order.total_ghs, 'To be confirmed')} bold />
              </View>
            </View>
          </View>
        </Reveal>

        <Reveal scrollY={scrollY} index={reveal++}>
          <SectionTitle>Details</SectionTitle>
          <View style={[styles.group, styles.details]}>
            <InfoRow icon="pin" title={order.customer_name} text={order.area} />
            <InfoRow icon="card" title="Payment" text={payment} />
            <InfoRow icon="calendar" title="Placed" text={formatDate(order.created_at)} />
          </View>
        </Reveal>

        <Reveal scrollY={scrollY} index={reveal++}>
          <SectionTitle>History</SectionTitle>
          <View style={[styles.group, styles.history]}>
            {timeline.map((step, i) => (
              <TimelineRow key={step.key} step={step} last={i === timeline.length - 1} />
            ))}
          </View>
        </Reveal>

        <Reveal scrollY={scrollY} index={reveal++} style={styles.actions}>
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
        </Reveal>
      </Animated.ScrollView>

      {/* Frosted bar: invisible at the top, fades in with the small title once the big one has scrolled away. */}
      <Animated.View pointerEvents="none" style={[styles.bar, { height: headerHeight, opacity: barOpacity }]}>
        {Platform.OS === 'ios' ? <BlurView intensity={60} tint="default" style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]} />}
        <View style={styles.barLine} />
        <AppText weight="semibold" size={16} style={[styles.barTitle, { top }]} numberOfLines={1}>
          Order {order.order_number}
        </AppText>
      </Animated.View>
      <View style={[styles.back, { top }]}>
        <IconButton icon="chevronLeft" label="Back" round background={colors.glass} onPress={() => (router.canGoBack() ? router.back() : router.replace('/orders'))} />
      </View>
    </View>
  );
}

function TimelineRow({ step, last }: { step: ReturnType<typeof buildTimeline>[number]; last: boolean }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const pulse = usePulse(step.state === 'current');
  return (
    <View style={styles.tlRow}>
      <View style={styles.tlRail}>
        <View style={styles.tlDotWrap}>
          {step.state === 'current' && <Animated.View style={[styles.tlRing, pulse]} />}
          <View style={[styles.tlDot, step.state === 'done' && styles.tlDotDone, step.state === 'current' && styles.tlDotCurrent]} />
        </View>
        {!last && <View style={[styles.tlLine, step.state === 'done' && { backgroundColor: colors.accent }]} />}
      </View>
      <View style={[styles.flex, !last && styles.tlBody]}>
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
  );
}

function Total({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.line}>
      <AppText size={bold ? 16 : 14} color={bold ? colors.ink : colors.textMuted} weight={bold ? 'bold' : 'regular'} style={styles.flex}>
        {label}
      </AppText>
      <AppText weight="bold" size={bold ? 18 : 14}>
        {value}
      </AppText>
    </View>
  );
}

/** An unpaid order: send the Mobile Money prompt again to the same or another number. */
function PayAgain({ token, reservedUntil, onChanged }: { token: string; reservedUntil: string | null; onChanged: () => void }) {
  const colors = useColors();
  const [network, setNetwork] = useState<MomoNetwork>('mtn');
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const until = reservedUntil ? new Date(reservedUntil).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' }) : null;

  const payments = useQuery('payment-options', getPaymentOptions, 60_000);
  const online = payments.data?.online === true && !payments.error;

  async function send(card = false) {
    if (!online || busy) return;
    if (!card && wallet.replace(/\D/g, '').length < 9) return setResult({ ok: false, text: 'Enter the Mobile Money number to charge.' });
    setBusy(true);
    const r = await requestPayment(token, card ? { card: true } : { network, wallet: wallet.trim() });
    setBusy(false);
    setResult(
      r.kind === 'requested'
        ? {
            ok: true,
            text: r.checkoutUrl
              ? 'Finish paying on our payment partner’s page. This page updates by itself.'
              : 'Check your phone and approve the prompt. This page updates by itself.',
          }
        : { ok: false, text: r.reason },
    );
    if (r.kind === 'requested' && r.checkoutUrl) void openPaymentPage(r.checkoutUrl);
    onChanged();
  }

  return (
    <Card title="Pay for this order">
      <AppText size={13} color={colors.textMuted}>
        {until ? `We are holding your items until ${until}.` : 'We are holding your items for a short time.'}
      </AppText>
      {result ? <Notice tone={result.ok ? 'good' : 'warn'}>{result.text}</Notice> : null}
      {online ? (
        <>
          <Choices label="Network" value={network} onChange={setNetwork} options={momoNetworks.map((n) => ({ id: n.id, label: n.label }))} />
          <Field label="Mobile Money number" value={wallet} onChangeText={setWallet} keyboardType="phone-pad" />
          <Button label={payments.data?.hosted ? 'Pay with Mobile Money' : 'Send the payment prompt'} onPress={() => void send()} busy={busy} />
          {payments.data?.card ? <Button label="Pay by card" kind="secondary" onPress={() => void send(true)} busy={busy} /> : null}
        </>
      ) : (
        <>
          <Notice>{payments.loading || payments.refreshing ? 'Checking payment options…' : 'Online payment options are unavailable right now.'}</Notice>
          <Button label="Check payment options again" kind="secondary" busy={payments.loading || payments.refreshing} onPress={() => void payments.refetch()} />
        </>
      )}
    </Card>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 18 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancel: { marginTop: 4 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 10 },

  largeTitle: { gap: 2, paddingHorizontal: 2, marginBottom: 2 },
  bigTitle: { letterSpacing: -0.6 },
  sectionTitle: { letterSpacing: 0.8, paddingLeft: 6, marginBottom: 8 },

  bar: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  barLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  barTitle: { position: 'absolute', left: 72, right: 72, textAlign: 'center', lineHeight: 44 },
  back: { position: 'absolute', left: 14, zIndex: 5 },

  group: { borderRadius: 24, borderCurve: 'continuous', backgroundColor: colors.canvas, overflow: 'hidden' },
  hairlineTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },

  hero: { gap: 22, padding: 20, borderRadius: 28, borderCurve: 'continuous', backgroundColor: colors.canvas },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroIconWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  heroRing: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { letterSpacing: -0.3, lineHeight: 27 },

  journeyRow: { flexDirection: 'row' },
  journeyCell: { flex: 1, alignItems: 'center', gap: 8 },
  nodeWrap: { width: '100%', height: 40, alignItems: 'center', justifyContent: 'center' },
  connectorIn: { position: 'absolute', left: '-50%', right: '50%', top: 18, height: 4, marginHorizontal: 20 },
  connectorTrack: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 2, backgroundColor: colors.lineTrack },
  connectorFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 2, transformOrigin: 'left' },
  ring: { position: 'absolute', width: 40, height: 40, borderRadius: 20 },
  node: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderWidth: 2, borderColor: colors.lineTrack },
  nodeDone: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, margin: -2, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 9, height: 15, marginTop: -3, borderRightWidth: 3, borderBottomWidth: 3, borderColor: '#FFFFFF', transform: [{ rotate: '45deg' }] },
  stageLabel: { textAlign: 'center' },

  codeCard: { gap: 16, padding: 20, borderRadius: 28, borderCurve: 'continuous', backgroundColor: colors.ink },
  codeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeEyebrow: { letterSpacing: 1, opacity: 0.8 },
  codeRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  codeTile: { flex: 1, maxWidth: 68, height: 76, borderRadius: 18, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,127,127,0.28)' },
  codeNote: { opacity: 0.75, lineHeight: 19 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  thumbWrap: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: 16, borderCurve: 'continuous' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  qtyBadge: { position: 'absolute', right: -6, top: -6, minWidth: 24, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.canvas },
  totals: { gap: 8, padding: 16 },
  grand: { marginTop: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },

  details: { padding: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  infoIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },

  history: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 4 },
  tlRow: { flexDirection: 'row', gap: 14 },
  tlRail: { width: 16, alignItems: 'center' },
  tlDotWrap: { width: 16, height: 16, marginTop: 3, alignItems: 'center', justifyContent: 'center' },
  tlRing: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accentWarm },
  tlDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.lineTrack, backgroundColor: colors.canvas },
  tlDotDone: { borderColor: colors.accent, backgroundColor: colors.accent },
  tlDotCurrent: { borderColor: colors.accentWarm, backgroundColor: colors.accentWarm },
  tlLine: { flex: 1, width: 2, marginTop: 4, marginBottom: -2, borderRadius: 1, backgroundColor: colors.lineTrack },
  tlBody: { paddingBottom: 20 },
});
