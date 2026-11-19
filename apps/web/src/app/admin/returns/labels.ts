import type { ReturnStatus } from '@/lib/orders';

export const returnStatusShort: Record<ReturnStatus, string> = {
  requested: 'To review',
  approved: 'Awaiting item',
  received: 'Refund due',
  refunded: 'Refunded',
  rejected: 'Declined',
};

export const returnTones: Partial<Record<ReturnStatus, 'good' | 'warn' | 'bad'>> = {
  requested: 'warn',
  received: 'warn',
  refunded: 'good',
  rejected: 'bad',
};

export const outcomeLabels = {
  restock: 'Restock (back on sale)',
  quarantine: 'Quarantine (hold for inspection)',
  write_off: 'Write off (damaged or unsellable)',
} as const;
