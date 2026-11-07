'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

/** Checkout, the help centre and product pages show these, so every change refreshes the catalogue cache. */
function saved(message: string): ActionState {
  updateTag('catalog');
  refresh();
  return done(message);
}

export async function saveOption(optionId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_save_delivery_option', {
    p: {
      id: optionId,
      label: text(form, 'label'),
      fee_ghs: text(form, 'fee'),
      free_eligible: form.get('free') === 'on',
      days_min: text(form, 'days_min'),
      days_max: text(form, 'days_max'),
      cutoff_time: text(form, 'cutoff'),
    } as Json,
  });
  return error ? failed(error) : saved('Saved.');
}

export async function saveThreshold(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_update_settings', { p: { free_delivery_threshold_ghs: text(form, 'threshold') } });
  return error ? failed(error) : saved(text(form, 'threshold') ? 'Free delivery threshold saved.' : 'Free delivery switched off.');
}

export async function saveZone(zoneId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const name = text(form, 'name');
  const id = zoneId ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_save_delivery_zone', {
    p_id: id,
    p_name: name,
    p_sort_order: Number(text(form, 'sort_order') || 0),
  });
  return error ? failed(error) : saved(zoneId ? 'Zone saved.' : 'Zone added. Now set its fees and add areas to it.');
}

export async function deleteZone(zoneId: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_delete_delivery_zone', { p_id: zoneId });
  return error ? failed(error) : saved('Zone deleted. Its areas now use the standard fees.');
}

export async function saveRates(zoneId: string, optionIds: string[], _: ActionState, form: FormData): Promise<ActionState> {
  const rates = optionIds.map((optionId) => ({ optionId, fee: text(form, `fee:${optionId}`), available: form.get(`available:${optionId}`) === 'on' }));
  if (rates.some((r) => r.fee !== '' && Number.isNaN(Number(r.fee)))) return { ok: false, message: 'Fees must be numbers.' };
  const supabase = await createUserSupabase();
  for (const r of rates) {
    const { error } = await supabase.rpc('admin_set_delivery_rate', {
      p_zone_id: zoneId,
      p_option_id: r.optionId,
      // Empty: the option's standard fee.
      p_fee: r.fee === '' ? (null as unknown as number) : Number(r.fee),
      p_available: r.available,
    });
    if (error) return failed(error);
  }
  return saved('Fees saved.');
}

export async function saveArea(oldName: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_save_delivery_area', {
    p: {
      old_name: oldName ?? '',
      name: text(form, 'name'),
      zone_id: text(form, 'zone'),
      is_active: oldName ? form.get('active') === 'on' : true,
      sort_order: text(form, 'sort_order'),
    } as Json,
  });
  return error ? failed(error) : saved(oldName ? 'Area saved.' : 'Area added. Shoppers can choose it at checkout now.');
}
