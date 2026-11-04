'use server';

import { refresh, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';
import { productFromForm } from '@/lib/vendor-product-form';

function details(form: FormData): Json {
  return {
    name: text(form, 'name'),
    tagline: text(form, 'tagline'),
    description: text(form, 'description'),
    contact_name: text(form, 'contact_name'),
    phone: text(form, 'phone'),
    email: text(form, 'email'),
    business_type: text(form, 'business_type') || 'individual',
    legal_name: text(form, 'legal_name') || text(form, 'contact_name'),
    tin: text(form, 'tin'),
    business_registration: text(form, 'business_registration'),
    payout_network: text(form, 'payout_network'),
    payout_wallet: text(form, 'payout_wallet'),
    payout_name: text(form, 'payout_name'),
  };
}

export async function createSupplier(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_create_supplier', { p: details(form) });
  if (error) return failed(error);
  updateTag('catalog');
  redirect(`/admin/suppliers/${data}`);
}

export async function updateSupplier(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_update_supplier', { p_vendor_id: id, p: details(form) });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Supplier saved.');
}

/** Adds a product for a supplier, or saves changes to one. It then waits in Vendors → Products to review for the markup and approval. */
export async function saveSupplierProduct(vendorId: string, productId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_save_supplier_product', { p_vendor_id: vendorId, p: productFromForm(form, productId) });
  if (error) return failed(error);
  updateTag('catalog');
  const saved = data as unknown as { id: string; problems: string[] };
  if (!productId) redirect(`/admin/suppliers/${vendorId}/products/${saved.id}?created=1`);
  refresh();
  return done(
    saved.problems.length
      ? `Saved. Before it can go on sale it still needs: ${saved.problems.join(', ')}.`
      : 'Saved. Approve it with its markup under Vendors → Products to review.',
  );
}

export async function setSupplierStock(vendorId: string, productId: string, sizeCode: string, _: ActionState, form: FormData): Promise<ActionState> {
  const quantity = Number(text(form, 'quantity'));
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, message: 'Enter a whole number, 0 or more.' };
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_supplier_stock', { p_vendor_id: vendorId, p_product_id: productId, p_size_code: sizeCode, p_quantity: quantity });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Stock saved.');
}

export async function deleteSupplierProduct(vendorId: string, productId: string): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_delete_supplier_product', { p_vendor_id: vendorId, p_product_id: productId });
  if (error) return failed(error);
  updateTag('catalog');
  redirect(`/admin/suppliers/${vendorId}`);
}

export async function setVendorAccountsOpen(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_vendor_accounts_open', { p_open: form.get('open') === 'on' });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Saved.');
}
