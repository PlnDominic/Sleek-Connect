'use server';

import { refresh } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

/** Splits "a, b\nc" into a clean list (empty when nothing is typed). */
const list = (value: string) => value.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);

/** A date typed in Accra time (the date picker has no zone) as an ISO time; empty means none. Accra is UTC+0 all year. */
const when = (value: string) => (value ? new Date(`${value}:00Z`).toISOString() : '');

function payload(form: FormData, id: string | null): Json {
  return {
    id: id ?? '',
    code: text(form, 'code'),
    label: text(form, 'label'),
    kind: text(form, 'kind'),
    value: text(form, 'value'),
    minimum_spend_ghs: text(form, 'minimum_spend_ghs'),
    starts_at: when(text(form, 'starts_at')),
    ends_at: when(text(form, 'ends_at')),
    max_uses: text(form, 'max_uses'),
    first_order_only: form.get('first_order_only') === 'on',
    active: form.get('active') === 'on',
    allowed_slugs: list(text(form, 'allowed_slugs')),
    allowed_categories: form.getAll('allowed_categories').map(String),
  };
}

/** Creates a promo code, or saves changes to one. */
export async function savePromotion(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_save_promotion', { p: payload(form, id) });
  if (error) return failed(error);
  refresh();
  return done(id ? 'Promo code saved.' : 'Promo code created.');
}

export async function setPromotionActive(id: string, active: boolean): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_promotion_active', { p_id: id, p_active: active });
  if (error) return failed(error);
  refresh();
  return done(active ? 'Switched on.' : 'Switched off. Shoppers can no longer use it.');
}

export async function deletePromotion(id: string): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_delete_promotion', { p_id: id });
  if (error) return failed(error);
  refresh();
  return done('Deleted.');
}
