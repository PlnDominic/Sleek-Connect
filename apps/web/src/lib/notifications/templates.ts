import { formatPrice } from '@sleek/shared';
import { failureReasons, type DeliveryFailureReason } from '@/lib/orders';
import { siteUrl } from '@/lib/site';

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
}

export interface Message {
  subject: string;
  text: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** One template per customer-facing status change (PRD FR-060). SMS gets the text; email gets subject and text. */
export function renderMessage(template: string, p: NotificationPayload): Message | null {
  const link = p.order_token ? `${siteUrl()}/orders/${p.order_token}` : `${siteUrl()}/help`;
  const hi = `Hi ${firstName(p.customer_name)},`;
  switch (template) {
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
