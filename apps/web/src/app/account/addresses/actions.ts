'use server';

import { refresh } from 'next/cache';
import { text, type ActionState } from '@/lib/admin/action-state';
import { createUserSupabase } from '@/lib/supabase/server';

export type AddressState = ActionState;


export async function saveAddress(id: string | null, _: AddressState, form: FormData): Promise<AddressState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('save_address', {
    p: {
      id: id ?? '',
      label: text(form, 'label'),
      recipient_name: text(form, 'recipient_name'),
      phone: text(form, 'phone'),
      // The area is picked at checkout; it is only sent if a form still has the field.
      ...(form.has('area') ? { area: text(form, 'area') } : {}),
      ghanapost_gps: text(form, 'ghanapost_gps'),
      directions: text(form, 'directions'),
      is_default: form.get('is_default') === 'on',
    },
  });
  if (error) {
    if (error.code === '22023' || error.code === '42501') return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message: 'That didn’t save. Please try again.' };
  }
  refresh();
  return { ok: true, message: id ? 'Address updated.' : 'Address saved.' };
}

export async function deleteAddress(id: string): Promise<void> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('delete_address', { p_id: id });
  if (error) console.error(error);
  refresh();
}

export async function makeDefault(id: string): Promise<void> {
  const supabase = await createUserSupabase();
  const { data: a } = await supabase.from('customer_addresses').select('*').eq('id', id).maybeSingle();
  if (!a) return;
  const { error } = await supabase.rpc('save_address', { p: { ...a, is_default: true } });
  if (error) console.error(error);
  refresh();
}
