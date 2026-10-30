import { type DeliveryFailureReason, type OrderStatus } from '@sleek/shared';
import { supabase } from './supabase';
import { deviceStorage } from './storage';

/** The shopper's view of an order, as returned by `get_order(token)`. Only what the app shows is listed. */
export interface CustomerOrder {
  order_number: string;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  /** Pay on delivery: when staff confirmed the order. */
  cod_confirmed_at: string | null;
  reserved_until: string | null;
  customer_name: string;
  area: string;
  delivery_option: string;
  is_gift: boolean;
  payment_method: 'momo' | 'card' | 'cod';
  momo_network: 'mtn' | 'telecel' | 'at' | null;
  wallet_ending: string | null;
  subtotal_ghs: number;
  delivery_fee_ghs: number | null;
  total_ghs: number | null;
  delivery_code: string | null;
  rider: { name: string; vehicle: string } | null;
  courier_reference: string | null;
  delivered_at: string | null;
  refund_due: boolean;
  can_cancel: boolean;
  return_open: boolean;
  items: {
    id: string;
    name: string;
    slug: string | null;
    size_label: string | null;
    quantity: number;
    unit_price_ghs: number;
    line_total_ghs: number;
  }[];
  events: { status: OrderStatus; at: string; reason: DeliveryFailureReason | null }[];
}

export interface OrderSummary {
  order_number: string;
  order_token: string;
  status: OrderStatus;
  created_at: string;
  item_count: number;
  total_ghs: number | null;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOrder(token: string): Promise<CustomerOrder | null> {
  if (!UUID_PATTERN.test(token)) return null;
  const { data, error } = await supabase.rpc('get_order', { p_order_token: token });
  if (error) throw new Error(error.message);
  return (data as CustomerOrder | null) ?? null;
}

export async function getMyOrders(): Promise<OrderSummary[]> {
  const { data, error } = await supabase.rpc('my_orders');
  if (error) throw new Error(error.message);
  return (data as OrderSummary[]) ?? [];
}

/** The private token for an order number, when the phone number matches the one used at checkout. */
export async function findOrder(orderNumber: string, phone: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_order', { p_order_number: orderNumber.trim(), p_phone: phone.trim() });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function cancelOrder(token: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_my_order', { p_order_token: token });
  if (error) throw new Error(error.code === '22023' ? error.message : 'We could not cancel the order. Please try again.');
}

export async function getOrderStatus(token: string): Promise<{ status: OrderStatus; paymentStatus: string | null } | null> {
  const { data, error } = await supabase.rpc('get_order_status', { p_order_token: token }).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { status: OrderStatus; payment_status: string | null } | null;
  return row ? { status: row.status, paymentStatus: row.payment_status } : null;
}

// --- Orders opened on this phone, so guests can find them again without typing anything ---------------------------

const KEY = 'sleek-connect:recent-orders:v1';
const MAX = 8;

export interface RecentOrder {
  token: string;
  orderNumber: string;
}

export function readRecentOrders(): RecentOrder[] {
  try {
    const value = JSON.parse(deviceStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((v): v is RecentOrder => typeof v?.token === 'string' && typeof v?.orderNumber === 'string').slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberOrder(order: RecentOrder) {
  const next = [order, ...readRecentOrders().filter((o) => o.token !== order.token)].slice(0, MAX);
  deviceStorage.setItem(KEY, JSON.stringify(next));
}

const dateTime = new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' });
const dateOnly = new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' });
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));
