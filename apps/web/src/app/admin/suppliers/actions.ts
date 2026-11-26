'use server';

import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

function payload(form: FormData, id: string | null): Json {
  return {
    id: id ?? '',
    name: text(form, 'name'),
    contact_name: text(form, 'contact_name'),
    phone: text(form, 'phone'),
    email: text(form, 'email'),
    address: text(form, 'address'),
    payment_terms: text(form, 'payment_terms'),
    notes: text(form, 'notes'),
    // Tax and payment details are only sent by the form that shows them (finance and admin); the database ignores them from anyone else.
    business_type: text(form, 'business_type'),
    legal_name: text(form, 'legal_name'),
    tin: text(form, 'tin'),
    business_registration: text(form, 'business_registration'),
    payout_network: text(form, 'payout_network'),
    payout_wallet: text(form, 'payout_wallet'),
    payout_name: text(form, 'payout_name'),
  };
}

/** Adds a supplier, or saves changes to one. */
export async function saveSupplier(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_save_supplier', { p: payload(form, id) });
  if (error) return failed(error);
  refresh();
  return done(id ? 'Supplier saved.' : 'Supplier added.');
}

export async function setSupplierActive(id: string, active: boolean): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_supplier_active', { p_id: id, p_active: active });
  if (error) return failed(error);
  refresh();
  return done(active ? 'Back in the supplier list.' : 'Hidden from the receiving menu. Their history is kept.');
}

export async function deleteSupplier(id: string): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_delete_supplier', { p_id: id });
  if (error) return failed(error);
  redirect('/admin/suppliers');
}

/** Records a payment made to a supplier (finance and admin). */
export async function recordSupplierPayment(supplierId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_record_supplier_payment', {
    p_supplier_id: supplierId,
    p_amount: Number(text(form, 'amount')),
    p_paid_on: text(form, 'paid_on') || undefined,
    p_method: text(form, 'method'),
    p_reference: text(form, 'reference') || undefined,
    p_note: text(form, 'note') || undefined,
  });
  if (error) return failed(error);
  refresh();
  return done('Payment recorded.');
}

export async function deleteSupplierPayment(id: string): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_delete_supplier_payment', { p_id: id });
  if (error) return failed(error);
  refresh();
  return done('Payment removed.');
}
