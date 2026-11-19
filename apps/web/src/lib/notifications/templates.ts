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
  /** Pay on delivery: the customer pays the rider in cash, after staff confirm the order by phone. */
  pay_on_delivery?: boolean;
  /** Bag reminders: how many items were left, and the name of the one added last. */
  item_count?: number;
  first_item?: string;
}

export interface Message {
  subject: string;
  text: string;
  /** The designed version of an email, sent alongside the text. Only `renderEmail` fills it in. */
  html?: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;


/** One template per customer-facing status change (PRD FR-060). SMS gets the text; email gets subject and text. */
export function renderMessage(template: string, p: NotificationPayload): Message | null {
  return renderCustomerMessage(template, p);
}

function renderCustomerMessage(template: string, p: NotificationPayload): Message | null {
  const link = p.order_token ? `${siteUrl()}/orders/${p.order_token}` : `${siteUrl()}/help`;
  const hi = `Hi ${firstName(p.customer_name)},`;
  switch (template) {
    case 'order_received': {
      if (p.pay_on_delivery) {
        return {
          subject: `We received your order ${p.order_number}`,
          text: `${hi} thanks for your order ${p.order_number}${p.total_ghs === null ? '' : ` (${formatPrice(p.total_ghs)})`}. We'll call you to confirm it. You pay ${
            p.total_ghs === null ? 'the total' : formatPrice(p.total_ghs)
          } in cash when it arrives. Track it: ${link}`,
        };
      }
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
      if (p.pay_on_delivery) {
        return {
          subject: `Order ${p.order_number} confirmed`,
          text: `${hi} thank you! Sleek Connect Store order ${p.order_number} is confirmed. Please have ${
            p.total_ghs === null ? 'the total' : formatPrice(p.total_ghs)
          } in cash ready for the rider. Track it: ${link}`,
        };
      }
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
        text: `${hi} order ${p.order_number} is on the way${p.rider_name ? ` with ${p.rider_name}` : ''}. Give the rider your delivery code ${p.delivery_code}${
          p.pay_on_delivery ? ` and pay ${p.total_ghs === null ? 'the total' : formatPrice(p.total_ghs)} in cash` : ''
        }. ${link}`,
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
    case 'bag_reminder': {
      const n = p.item_count ?? 1;
      const what = n > 1 ? `${p.first_item ?? 'your items'} and ${n - 1} more` : (p.first_item ?? 'your item');
      return {
        subject: 'You left something in your bag',
        text: `${hi} you left ${what} in your bag${p.total_ghs ? ` (${formatPrice(p.total_ghs)})` : ''}. Stop these reminders any time in Account → Details. Finish your order: ${siteUrl()}/bag`,
      };
    }
    default:
      return null;
  }
}

const ctaLabels: Record<string, string> = {
  order_received: 'Track your order',
  bag_reminder: 'Back to your bag',
};

/** The few facts worth showing in a box, taken from what was captured when the message was queued. */
function emailFacts(template: string, p: NotificationPayload): [string, string][] {
  const facts: [string, string][] = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') facts.push([label, String(value)]);
  };
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
export function renderEmail(template: string, p: NotificationPayload, alert?: { sentTo: string }): Message | null {
  const message = renderMessage(template, p);
  if (!message) return null;
  const payload = p;
  const { body, url } = splitTrailingUrl(message.text);
  const facts = emailFacts(template, payload);
  if (alert) facts.push(['Sent to', alert.sentTo]);
  const code = template === 'out_for_delivery' && payload.delivery_code && !alert ? { label: 'Your delivery code', value: payload.delivery_code } : undefined;
  const help = `${siteUrl()}/help`;
  const html = buildEmailHtml({
    subject: message.subject,
    // A greeting on its own line reads better than one run-on paragraph.
    body: (alert ? `A copy of what the customer was sent:\n\n` : '') + body.replace(/^(Hi [^,\n]{1,40},) (\p{L})/u, (_, greeting: string, first: string) => `${greeting}\n\n${first.toUpperCase()}`),
    facts,
    code,
    cta: alert ? { label: 'Open the admin console', url: `${siteUrl()}/admin` } : url ? { label: url === help ? 'Visit the help centre' : (ctaLabels[template] ?? 'View your order'), url } : undefined,
    tag: alert ? 'Store alert' : undefined,
    reason: alert
      ? 'A copy of this message for the store owner.'
      : template === 'bag_reminder'
        ? 'You are receiving this because you agreed to offers and reminders from Sleek Connect Store. You can stop them any time in Account → Details.'
        : 'You are receiving this because of an order or request you made at Sleek Connect Store.',
    helpUrl: help,
  });
  return { ...message, html };
}
