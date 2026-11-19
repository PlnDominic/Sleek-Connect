'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import type { Database } from '@/lib/supabase/database.types';

export interface OrderStatus {
  status: Database['public']['Enums']['order_status'];
  paymentStatus: Database['public']['Enums']['payment_status'] | null;
}

const POLL_MS = 3000;

/** Follows an order until it leaves "pending payment": paid, or cancelled after a failed or expired payment. */
export function useOrderStatus(orderToken: string | null): OrderStatus | null {
  const [latest, setLatest] = useState<{ token: string; status: OrderStatus } | null>(null);

  useEffect(() => {
    if (!orderToken) return;
    const supabase = createBrowserSupabase();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      const { data } = await supabase.rpc('get_order_status', { p_order_token: orderToken }).maybeSingle();
      if (stopped) return;
      if (data) setLatest({ token: orderToken, status: { status: data.status, paymentStatus: data.payment_status ?? null } });
      if (!data || data.status === 'pending_payment') timer = setTimeout(check, POLL_MS);
    };
    void check();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [orderToken]);

  return latest && latest.token === orderToken ? latest.status : null;
}
