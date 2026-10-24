import 'server-only';
import { createSupabase } from '@/lib/supabase/server';
import { UUID_PATTERN, type CustomerOrder } from '@/lib/orders';

/** Loads an order by the unguessable token from the customer's link. Never cached: it changes as it's fulfilled. */
export async function getCustomerOrder(token: string): Promise<CustomerOrder | null> {
  if (!UUID_PATTERN.test(token)) return null;
  const { data, error } = await createSupabase().rpc('get_order', { p_order_token: token });
  if (error) throw error;
  return (data as unknown as CustomerOrder | null) ?? null;
}
