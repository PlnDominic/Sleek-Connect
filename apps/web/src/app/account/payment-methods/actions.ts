'use server';

import { refresh } from 'next/cache';
import { createUserSupabase } from '@/lib/supabase/server';

export type MethodState = { ok: boolean; message: string } | null;

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export async function savePaymentMethod(_: MethodState, form: FormData): Promise<MethodState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('save_payment_method', {
    p: {
      network: text(form, 'network'),
      wallet_number: text(form, 'wallet_number'),
      label: text(form, 'label'),
      is_default: form.get('is_default') === 'on',
    },
  });
  if (error) {
    if (error.code === '22023' || error.code === '42501') return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message: 'That didn’t save. Please try again.' };
  }
  refresh();
  return { ok: true, message: 'Number saved.' };
}

export async function deletePaymentMethod(id: string): Promise<void> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('delete_payment_method', { p_id: id });
  if (error) console.error(error);
  refresh();
}

export async function makeDefaultPaymentMethod(id: string): Promise<void> {
  const supabase = await createUserSupabase();
  const { data: m } = await supabase.from('saved_payment_methods').select('network, wallet_number, label').eq('id', id).maybeSingle();
  if (!m) return;
  const { error } = await supabase.rpc('save_payment_method', { p: { ...m, is_default: true } });
  if (error) console.error(error);
  refresh();
}
