'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import { formatPrice } from '@sleek/shared';
import type { Database, Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

const vendorDecisions: Database['public']['Enums']['vendor_status'][] = ['active', 'rejected', 'suspended'];
const onboardingChecks = ['id_matches', 'id_valid', 'phone_confirmed', 'products_allowed', 'address_confirmed', 'business_documents'] as const;
const productChecks = ['photos_ok', 'description_ok', 'claims_ok', 'ingredients_ok', 'expiry_ok', 'authentic_ok', 'regulatory_ok', 'safety_ok'] as const;
const productDecisions: Database['public']['Enums']['product_review_status'][] = ['approved', 'rejected', 'pending'];

export async function reviewVendor(vendorId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const decision = vendorDecisions.find((d) => d === text(form, 'decision'));
  if (!decision) return { ok: false, message: 'Choose what to do with this vendor.' };
  const supabase = await createUserSupabase();
  // The onboarding checklist is part of the same form: save what is ticked first, so approving sees it.
  if (form.has('checks_form')) {
    const checks = Object.fromEntries(onboardingChecks.map((c) => [c, form.get(`check_${c}`) === 'on']));
    const { error: checkError } = await supabase.rpc('admin_save_vendor_checks', { p_vendor_id: vendorId, p_checks: checks });
    if (checkError) return failed(checkError);
  }
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
  // Each check is answered Yes, Not applicable, or left unchecked.
  const checks = Object.fromEntries(productChecks.map((c) => [c, text(form, `check_${c}`) === 'na' ? 'na' : text(form, `check_${c}`) === 'ok']));
  const { error } = await supabase.rpc('admin_review_product', {
    p_product_id: productId,
    p_decision: decision,
    p_markup_percent: markup === '' ? undefined : Number(markup),
    p_note: text(form, 'note') || undefined,
    p_checks: checks,
  });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done(decision === 'approved' ? 'Product approved.' : decision === 'rejected' ? 'Product rejected.' : 'Sent back to the vendor.');
}

export async function saveMarketplaceSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const p: Record<string, string | boolean> = { marketplace_orders_open: form.get('marketplace_orders_open') === 'on' };
  p.vendor_tin_required = form.get('vendor_tin_required') === 'on';
  for (const key of ['vendor_annual_fee_ghs', 'vendor_grace_days', 'default_markup_percent', 'vendor_payout_hold_days', 'vendor_min_payout_ghs', 'vendor_support_reply_hours']) {
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
  if (decision === 'approved' && form.get('all_checked') !== 'on') {
    return { ok: false, message: 'Tick “I checked every ticked product against the product standards” to approve several at once.' };
  }
  const checks = Object.fromEntries(productChecks.map((c) => [c, true]));
  const supabase = await createUserSupabase();
  let succeeded = 0;
  const failures: string[] = [];
  for (const id of ids) {
    const { error } = await supabase.rpc('admin_review_product', {
      p_product_id: id,
      p_decision: decision,
      p_markup_percent: decision === 'approved' && markup !== '' ? Number(markup) : undefined,
      p_note: text(form, 'note') || undefined,
      p_checks: decision === 'approved' ? checks : undefined,
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

/** Staff have taken a vendor's packed items from them, so the order can go out. */
export async function collectItems(orderId: string, vendorId: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_collect_vendor_items', { p_order_id: orderId, p_vendor_id: vendorId });
  if (error) return failed(error);
  refresh();
  return done('Marked as collected.');
}

/** Records money already sent to a vendor, which takes it off what they are owed. */
export async function recordPayout(vendorId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const amount = Number(text(form, 'amount'));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: 'Enter the amount you paid.' };
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_record_payout', {
    p_vendor_id: vendorId,
    p_amount_ghs: amount,
    p_method: text(form, 'method') || 'momo',
    p_reference: text(form, 'reference'),
    p_note: text(form, 'note') || undefined,
  });
  if (error) return failed(error);
  refresh();
  return done(`Payment recorded. ${formatPrice(data)} is still owed to this vendor.`);
}

export async function replyToVendor(vendorId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_reply_vendor', { p_vendor_id: vendorId, p_body: text(form, 'body') });
  if (error) return failed(error);
  refresh();
  return done('Reply sent.');
}

/** Enters (or corrects) a vendor's tax details from their paperwork. They can also do it themselves. */
export async function setVendorTax(vendorId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_vendor_tax_info', {
    p_vendor_id: vendorId,
    p: {
      business_type: text(form, 'business_type'),
      legal_name: text(form, 'legal_name'),
      tin: text(form, 'tin'),
      business_registration: text(form, 'business_registration'),
    },
  });
  if (error) return failed(error);
  refresh();
  return done('Tax details saved.');
}

const disputeKinds: Database['public']['Enums']['vendor_dispute_kind'][] = ['counterfeit', 'damaged', 'not_as_described', 'wrong_item', 'other'];
const disputeOutcomes: Database['public']['Enums']['vendor_dispute_outcome'][] = ['upheld', 'partly_upheld', 'dismissed'];

/** Opens a dispute from a shopper's report about an item from an independent store. */
export async function openDispute(_: ActionState, form: FormData): Promise<ActionState> {
  const kind = disputeKinds.find((k) => k === text(form, 'kind'));
  if (!kind) return { ok: false, message: 'Choose what was reported.' };
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_open_vendor_dispute', {
    p_order_number: text(form, 'order'),
    p_product_id: text(form, 'product'),
    p_kind: kind,
    p_details: text(form, 'details'),
  });
  if (error) return failed(error);
  refresh();
  return done(`Case ${data} opened. The vendor has 48 hours to reply.`);
}

/** Decides a dispute. Returns a warning when the vendor has reached the counterfeit limit. */
export async function resolveDispute(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const outcome = disputeOutcomes.find((o) => o === text(form, 'outcome'));
  if (!outcome) return { ok: false, message: 'Choose the outcome.' };
  const charge = Number(text(form, 'charge') || 0);
  if (!Number.isFinite(charge) || charge < 0) return { ok: false, message: 'Enter the charge as a number.' };
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_resolve_vendor_dispute', { p_id: id, p_outcome: outcome, p_charge_ghs: charge, p_note: text(form, 'note') });
  if (error) return failed(error);
  refresh();
  return done(
    data >= 2
      ? `Decided. This vendor now has ${data} upheld counterfeit cases: under the seller terms, suspend the store.`
      : outcome === 'dismissed'
        ? 'Decided: dismissed.'
        : `Decided. ${formatPrice(charge)} was charged to the vendor.`,
  );
}
