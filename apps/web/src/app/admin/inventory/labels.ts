import type { Database } from '@/lib/supabase/database.types';

export const movementLabels: Record<Database['public']['Enums']['stock_movement_reason'], string> = {
  opening: 'Opening stock',
  received: 'Received',
  sold: 'Sold (paid order)',
  picked: 'Packed for order',
  returned: 'Returned to batch',
  restocked: 'Back on sale (order cancelled)',
  adjusted: 'Count corrected',
  damaged: 'Damaged',
  lost: 'Lost',
  found: 'Found',
  quarantined: 'Quarantined',
  released: 'Released from quarantine',
  recalled: 'Recalled',
  expired: 'Expired',
  written_off: 'Written off',
};
