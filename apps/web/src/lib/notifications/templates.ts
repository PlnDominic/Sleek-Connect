import { formatPrice } from '@sleek/shared';
import { failureReasons, type DeliveryFailureReason } from '@/lib/orders';
import { siteUrl } from '@/lib/site';
import { buildEmailHtml, splitTrailingUrl } from './email-html';

/**
 * Values captured when the message was queued (see public.queue_order_notifications, and queue_return_message /
 * create_support_case for returns and support cases, which only fill some of them).
 */
export interface NotificationPayload {
  order_number: string;
  customer_name: string;
  total_ghs: number | null;
  /** Absent for support cases that aren't linked to an order. */
  order_token?: string;
  delivery_code: string;
  rider_name: string | null;
  courier_reference: string | null;
  reason: DeliveryFailureReason | null;
  refund_due: boolean;
  /** Return (RT-…) or support (CS-…) case number. */
  case_number?: string;
  /** A note from staff: the reason for a decision, or a reply to a support case. */
  note?: string | null;
  refund_amount_ghs?: number | null;
  /** When the held stock is released if the order isn't paid (ISO), for "order received". */
  reserved_until?: string | null;
}

export interface Message {
  subject: string;
  text: string;
  /** The designed version of an email, sent alongside the text. Only `renderEmail` fills it in. */
  html?: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Values for the messages sent to vendors (see public.queue_vendor_message, which adds the first three). */
export interface VendorPayload {
  vendor_name: string;
  owner_name: string;
  vendor_slug: string;
  note?: string | null;
  order_number?: string;
  item_count?: number;
  ends_on?: string;
  days_left?: number;
  fee_ghs?: number;
  amount_ghs?: number;
  reference?: string;
  product_name?: string;
  decision?: 'approved' | 'rejected';
  price_ghs?: number | null;
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Messages to people who sell on the marketplace. They carry no customer details. */
function renderVendorMessage(template: string, p: VendorPayload): Message | null {
  const hi = `Hi ${firstName(p.owner_name)},`;
  const dashboard = `${siteUrl()}/vendor`;
  const note = p.note ? ` ${p.note}` : '';
  switch (template) {
    case 'vendor_application_received':
      return {
        subject: `We've got your application for ${p.vendor_name}`,
        text: `${hi} thanks for applying to sell on Sleek Connect Store. We'll review ${p.vendor_name} and call you soon.`,
      };
    case 'vendor_approved':
      return {
        subject: `${p.vendor_name} is approved`,
        text: `${hi} ${p.vendor_name} is approved to sell on Sleek Connect Store.${note} Open your dashboard to pay the yearly fee and add products: ${dashboard}`,
      };
    case 'vendor_rejected':
      return {
        subject: `About your application for ${p.vendor_name}`,
        text: `${hi} we can't approve ${p.vendor_name} right now.${note} Contact us if you have questions: ${siteUrl()}/help`,
      };
    case 'vendor_suspended':
      return {
        subject: `${p.vendor_name} is paused`,
        text: `${hi} your store ${p.vendor_name} has been paused.${note} Contact us to sort it out: ${siteUrl()}/help`,
      };
    case 'vendor_subscription_paid':
      return {
        subject: `Subscription received for ${p.vendor_name}`,
        text: `${hi} we've received ${formatPrice(p.amount_ghs ?? 0)} for ${p.vendor_name}. Your store is open until ${p.ends_on ? longDate(p.ends_on) : 'next year'}.`,
      };
    case 'vendor_product_reviewed':
      return p.decision === 'approved'
        ? {
            subject: `${p.product_name} is approved`,
            text: `${hi} ${p.product_name} is approved${p.price_ghs ? ` and shoppers will pay ${formatPrice(p.price_ghs)}` : ''}.${note} ${dashboard}`,
          }
        : {
            subject: `${p.product_name} was not approved`,
            text: `${hi} we couldn't approve ${p.product_name}.${note} Fix it in your dashboard and send it again: ${dashboard}`,
          };
    case 'vendor_new_order':
      return {
        subject: `New order ${p.order_number}`,
        text: `${hi} order ${p.order_number} is paid and has ${plural(p.item_count ?? 0, 'item')} from ${p.vendor_name}. Pack ${
          (p.item_count ?? 0) === 1 ? 'it' : 'them'
        } and mark it packed: ${dashboard}/orders`,
      };
    case 'vendor_order_cancelled':
      return {
        subject: `Order ${p.order_number} was cancelled`,
        text: `${hi} order ${p.order_number} was cancelled, so you don't need to pack its items. Your stock is back on the shelf.`,
      };
    case 'vendor_renewal_reminder': {
      const days = p.days_left ?? 0;
      const when = days > 1 ? `ends in ${days} days` : days === 1 ? 'ends tomorrow' : days === 0 ? 'ends today' : 'has ended';
      return {
        subject: `${p.vendor_name}: your subscription ${when}`,
        text: `${hi} your Sleek Connect subscription for ${p.vendor_name} ${when}${p.ends_on ? ` (${longDate(p.ends_on)})` : ''}. Renew for ${formatPrice(p.fee_ghs ?? 0)} to keep selling: ${dashboard}`,
      };
    }
    case 'vendor_payout_sent':
      return {
        subject: `${formatPrice(p.amount_ghs ?? 0)} paid to you`,
        text: `${hi} we've paid ${formatPrice(p.amount_ghs ?? 0)} to you${p.reference ? ` (ref ${p.reference})` : ''}. See your statement: ${dashboard}/earnings`,
      };
    case 'vendor_message_reply':
      return {
        subject: 'Sleek Connect replied to you',
        text: `${hi} we've replied to your message. Read it in your dashboard: ${dashboard}/messages`,
      };
    default:
      return null;
  }
}

/** One template per customer-facing status change (PRD FR-060). SMS gets the text; email gets subject and text. */
export function renderMessage(template: string, p: NotificationPayload | VendorPayload): Message | null {
  if (template.startsWith('vendor_')) return renderVendorMessage(template, p as VendorPayload);
  return renderCustomerMessage(template, p as NotificationPayload);
}

function renderCustomerMessage(template: string, p: NotificationPayload): Message | null {
  const link = p.order_token ? `${siteUrl()}/orders/${p.order_token}` : `${siteUrl()}/help`;
  const hi = `Hi ${firstName(p.customer_name)},`;
  switch (template) {
    case 'order_received': {
      const until = p.reserved_until
        ? new Date(p.reserved_until).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' })
        : null;
      return {
        subject: `We received your order ${p.order_number}`,
        text: `${hi} thanks for your order ${p.order_number}${p.total_ghs === null ? '' : ` (${formatPrice(p.total_ghs)})`}. ${
          until ? `We're holding your items until ${until}. ` : ''
        }Approve the Mobile Money payment to confirm it, and we'll email you again when it is. Track it: ${link}`,
      };
    }
    case 'order_confirmed':
      return {
        subject: `Order ${p.order_number} confirmed`,
        text: `${hi} thank you! Sleek Connect Store order ${p.order_number}${
          p.total_ghs === null ? '' : ` (${formatPrice(p.total_ghs)})`
        } is confirmed. Track it and get your receipt: ${link}`,
      };
    case 'order_packed':
      return {
        subject: `Order ${p.order_number} is packed`,
        text: `${hi} order ${p.order_number} is packed and batch-checked. We'll text you when it's on the way. ${link}`,
      };
    case 'out_for_delivery':
      return {
        subject: `Order ${p.order_number} is on the way`,
        text: `${hi} order ${p.order_number} is on the way${p.rider_name ? ` with ${p.rider_name}` : ''}. Give the rider your delivery code ${p.delivery_code}. ${link}`,
      };
    case 'order_delivered':
      return {
        subject: `Order ${p.order_number} delivered`,
        text: `${hi} order ${p.order_number} has been delivered. Thank you for shopping with Sleek Connect Store!`,
      };
    case 'delivery_failed':
      return {
        subject: `We couldn't deliver order ${p.order_number}`,
        text: `${hi} we couldn't deliver order ${p.order_number}${
          p.reason ? ` (${failureReasons[p.reason].toLowerCase()})` : ''
        }. We'll call you to arrange another delivery. ${link}`,
      };
    case 'order_cancelled':
      return {
        subject: `Order ${p.order_number} cancelled`,
        text: `${hi} order ${p.order_number} has been cancelled. ${
          p.refund_due ? "We'll refund your payment and let you know when it's done." : ''
        }`.trim(),
      };
    case 'order_returned':
      return {
        subject: `Order ${p.order_number} returned`,
        text: `${hi} we couldn't complete delivery of order ${p.order_number}, so it has come back to us. We'll refund your payment and contact you.`,
      };
    case 'return_requested':
      return {
        subject: `Return ${p.case_number} received`,
        text: `${hi} we've received your return request ${p.case_number} for order ${p.order_number}. We'll review it and text you with the next step. ${link}`,
      };
    case 'return_approved':
      return {
        subject: `Return ${p.case_number} approved`,
        text: `${hi} return ${p.case_number} is approved.${p.note ? ` ${p.note}` : ''} We'll contact you to arrange getting the item back. ${link}`,
      };
    case 'return_rejected':
      return {
        subject: `About your return ${p.case_number}`,
        text: `${hi} we can't accept return ${p.case_number}.${p.note ? ` ${p.note}` : ''} Reply or contact us if you have questions. ${link}`,
      };
    case 'return_received':
      return {
        subject: `Return ${p.case_number}: item received`,
        text: `${hi} we've received and checked the item for return ${p.case_number}.${
          p.refund_amount_ghs ? ` Your refund of ${formatPrice(p.refund_amount_ghs)} is being processed.` : ''
        } ${link}`,
      };
    case 'return_refunded':
      return {
        subject: `Return ${p.case_number} refunded`,
        text: `${hi} we've refunded${p.refund_amount_ghs ? ` ${formatPrice(p.refund_amount_ghs)}` : ''} for return ${p.case_number} to your original payment method.`,
      };
    case 'support_received':
      return {
        subject: `We've got your message (${p.case_number})`,
        text: `${hi} thanks for contacting Sleek Connect Store. Your case number is ${p.case_number}. We'll get back to you soon.`,
      };
    case 'support_reply':
      return {
        subject: `Reply to your message (${p.case_number})`,
        text: `${hi} about case ${p.case_number}: ${p.note ?? ''}`.trim(),
      };
    default:
      return null;
  }
}

const ctaLabels: Record<string, string> = {
  order_received: 'Track your order',
  vendor_new_order: 'Open your orders',
  vendor_order_cancelled: 'Open your orders',
  vendor_payout_sent: 'See your earnings',
  vendor_message_reply: 'Read the reply',
  vendor_renewal_reminder: 'Renew your subscription',
  vendor_subscription_paid: 'Open your dashboard',
  vendor_approved: 'Open your dashboard',
  vendor_product_reviewed: 'Open your dashboard',
};

/** The few facts worth showing in a box, taken from what was captured when the message was queued. */
function emailFacts(template: string, p: NotificationPayload & VendorPayload): [string, string][] {
  const facts: [string, string][] = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') facts.push([label, String(value)]);
  };
  if (template.startsWith('vendor_')) {
    add('Order', p.order_number);
    add('Items', p.item_count);
    add('Product', p.product_name);
    add('Amount', p.amount_ghs === undefined ? undefined : formatPrice(p.amount_ghs));
    add('Reference', p.reference);
    add('Open until', p.ends_on ? longDate(p.ends_on) : undefined);
    add('Yearly fee', p.fee_ghs === undefined ? undefined : formatPrice(p.fee_ghs));
    return facts;
  }
  add('Order', p.order_number);
  add('Case number', p.case_number);
  add('Total', p.total_ghs === null || p.total_ghs === undefined || !p.order_number ? undefined : formatPrice(p.total_ghs));
  add('Rider', template === 'out_for_delivery' ? p.rider_name : undefined);
  add('Courier reference', p.courier_reference);
  add('Refund', p.refund_amount_ghs ? formatPrice(p.refund_amount_ghs) : undefined);
  return facts;
}

/**
 * The designed email for a message: the same words as the text version, with a heading, the key facts in a box, the
 * delivery code shown large when the rider will ask for it, and one button for the link. `alert` makes it a store alert:
 * labelled, with who it went to, and never showing a delivery code.
 */
export function renderEmail(template: string, p: NotificationPayload | VendorPayload, alert?: { sentTo: string }): Message | null {
  const message = renderMessage(template, p);
  if (!message) return null;
  const payload = p as NotificationPayload & VendorPayload;
  const { body, url } = splitTrailingUrl(message.text);
  const vendor = template.startsWith('vendor_');
  const facts = emailFacts(template, payload);
  if (alert) facts.push(['Sent to', alert.sentTo]);
  const code = template === 'out_for_delivery' && payload.delivery_code && !alert ? { label: 'Your delivery code', value: payload.delivery_code } : undefined;
  const help = `${siteUrl()}/help`;
  const html = buildEmailHtml({
    subject: message.subject,
    // A greeting on its own line reads better than one run-on paragraph.
    body: (alert ? `A copy of what ${vendor ? 'the vendor' : 'the customer'} was sent:\n\n` : '') + body.replace(/^(Hi [^,\n]{1,40},) (\p{L})/u, (_, greeting: string, first: string) => `${greeting}\n\n${first.toUpperCase()}`),
    facts,
    code,
    cta: alert ? { label: 'Open the admin console', url: `${siteUrl()}/admin` } : url ? { label: url === help ? 'Visit the help centre' : (ctaLabels[template] ?? 'View your order'), url } : undefined,
    tag: alert ? 'Store alert' : undefined,
    reason: alert
      ? 'A copy of this message for the store owner.'
      : vendor
        ? 'You are receiving this because you sell on Sleek Connect Store.'
        : 'You are receiving this because of an order or request you made at Sleek Connect Store.',
    helpUrl: help,
  });
  return { ...message, html };
}
