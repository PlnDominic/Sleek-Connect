'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import type { Database, Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

const vendorDecisions: Database['public']['Enums']['vendor_status'][] = ['active', 'rejected', 'suspended'];
const productDecisions: Database['public']['Enums']['product_review_status'][] = ['approved', 'rejected', 'pending'];

export async function reviewVendor(vendorId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const decision = vendorDecisions.find((d) => d === text(form, 'decision'));
  if (!decision) return { ok: false, message: 'Choose what to do with this vendor.' };
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_review_vendor', {
    p_vendor_id: vendorId,
    p_decision: decision,
    p_note: text(form, 'note') || undefined,
  });
  if (error) return failed(error);
  // A vendor going live or being suspended changes which products shoppers see.
  updateTag('catalog');
  refresh();
  return done(decision === 'active' ? 'Vendor approved.' : decision === 'rejected' ? 'Application rejected.' : 'Vendor suspended.');
}

export async function recordSubscription(vendorId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const amount = Number(text(form, 'amount'));
  if (!Number.isFinite(amount) || amount < 0 || !text(form, 'amount')) return { ok: false, message: 'Enter the amount paid.' };
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_record_subscription', {
    p_vendor_id: vendorId,
    p_amount_ghs: amount,
    p_method: text(form, 'method') || 'manual',
    p_reference: text(form, 'reference') || undefined,
    p_note: text(form, 'note') || undefined,
  });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done(`Payment recorded. The subscription now runs to ${data}.`);
}

export async function reviewProduct(productId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const decision = productDecisions.find((d) => d === text(form, 'decision'));
  if (!decision) return { ok: false, message: 'Choose what to do with this product.' };
  const markup = text(form, 'markup');
  if (decision === 'approved' && (markup === '' || !Number.isFinite(Number(markup)))) {
    return { ok: false, message: 'Enter the markup percentage before approving.' };
  }
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_review_product', {
    p_product_id: productId,
    p_decision: decision,
    p_markup_percent: markup === '' ? undefined : Number(markup),
    p_note: text(form, 'note') || undefined,
  });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done(decision === 'approved' ? 'Product approved.' : decision === 'rejected' ? 'Product rejected.' : 'Sent back to the vendor.');
}

export async function saveMarketplaceSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const p: Record<string, string | boolean> = { marketplace_orders_open: form.get('marketplace_orders_open') === 'on' };
  for (const key of ['vendor_annual_fee_ghs', 'vendor_grace_days', 'default_markup_percent']) {
    if (text(form, key)) p[key] = text(form, key);
  }
  p.vendor_payment_instructions = text(form, 'vendor_payment_instructions');
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_marketplace_settings', { p: p as Json });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Marketplace settings saved.');
}

/** Approves or rejects every ticked vendor product in one go. A blank markup keeps each product's own markup. */
export async function bulkReviewProducts(_: ActionState, form: FormData): Promise<ActionState> {
  const decision = text(form, 'decision');
  if (decision !== 'approved' && decision !== 'rejected') return { ok: false, message: 'Choose approve or reject.' };
  const ids = form.getAll('ids').map(String);
  if (ids.length === 0) return { ok: false, message: 'Tick the products you want to review first.' };
  const markup = text(form, 'markup');
  if (markup !== '' && !Number.isFinite(Number(markup))) return { ok: false, message: 'The markup must be a number.' };
  const supabase = await createUserSupabase();
  let succeeded = 0;
  const failures: string[] = [];
  for (const id of ids) {
    const { error } = await supabase.rpc('admin_review_product', {
      p_product_id: id,
      p_decision: decision,
      p_markup_percent: decision === 'approved' && markup !== '' ? Number(markup) : undefined,
      p_note: text(form, 'note') || undefined,
    });
    if (error) failures.push(error.code === '22023' || error.code === '42501' ? error.message : 'That didn’t work.');
    else succeeded++;
  }
  updateTag('catalog');
  refresh();
  const verb = decision === 'approved' ? 'Approved' : 'Rejected';
  if (failures.length === 0) return done(`${verb} ${succeeded} product${succeeded === 1 ? '' : 's'}.`);
  return { ok: false, message: `${verb} ${succeeded}. ${failures.length} could not be changed: ${failures.slice(0, 2).join(' ')}` };
}
