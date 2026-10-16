import { formatPrice } from '@sleek/shared';
import { failureReasons, type DeliveryFailureReason } from '@/lib/orders';

/** Values captured when the message was queued (see public.queue_order_notifications). */
export interface NotificationPayload {
  order_number: string;
  customer_name: string;
  total_ghs: number | null;
  order_token: string;
  delivery_code: string;
  rider_name: string | null;
  courier_reference: string | null;
  reason: DeliveryFailureReason | null;
  refund_due: boolean;
}

export interface Message {
  subject: string;
  text: string;
}

/** The public address of the store, for links in messages. */
export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** One template per customer-facing status change (PRD FR-060). SMS gets the text; email gets subject and text. */
export function renderMessage(template: string, p: NotificationPayload): Message | null {
  const link = `${siteUrl()}/orders/${p.order_token}`;
  const hi = `Hi ${firstName(p.customer_name)},`;
  switch (template) {
    case 'order_confirmed':
      return {
        subject: `Order ${p.order_number} confirmed`,
        text: `${hi} thank you! Sleek Connect order ${p.order_number}${
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
        text: `${hi} order ${p.order_number} has been delivered. Thank you for shopping with Sleek Connect!`,
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
    default:
      return null;
  }
}
