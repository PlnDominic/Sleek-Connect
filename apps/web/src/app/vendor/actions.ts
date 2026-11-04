'use server';

import { refresh, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import { momoNetworks, type MomoNetwork } from '@sleek/shared';
import { getCategories } from '@/lib/catalog';
import { startSubscriptionPayment } from '@/lib/payments/subscription';
import { vendorTermsVersion } from '@/lib/vendor-terms';
import { createUserSupabase } from '@/lib/supabase/server';
import { importLimit, readImport } from '@/lib/vendor-import';
import { productFromForm } from '@/lib/vendor-product-form';

export type NameCheck = { ok: boolean; reason?: string; suggestion?: string; slug?: string };

/** Live "is this store name free?" check for the opening wizard. It only says yes or no; it never lists other stores. */
export async function checkStoreName(name: string): Promise<NameCheck> {
  const trimmed = (name ?? '').slice(0, 80);
  if (trimmed.trim().length < 2) return { ok: false, reason: 'Enter a name of at least 2 characters.' };
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('vendor_name_available', { p_name: trimmed });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    // Never block the shopper on this check: the application itself repeats every rule.
    return { ok: true };
  }
  const r = data as Record<string, unknown>;
  return {
    ok: r.available === true,
    reason: typeof r.reason === 'string' ? r.reason : undefined,
    suggestion: typeof r.suggestion === 'string' ? r.suggestion : undefined,
    slug: typeof r.slug === 'string' ? r.slug : undefined,
  };
}

/**
 * Opens the store: the application itself, then (best effort) the tax details and payout account that were filled in
 * on the same form. Anything that doesn't save is left on the setup checklist for the vendor to finish.
 */
export async function applyForStore(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_apply', {
    p_name: text(form, 'name'),
    p_owner_name: text(form, 'owner_name'),
    p_email: text(form, 'email'),
    p_phone: text(form, 'phone'),
    p_id_type: text(form, 'id_type'),
    p_id_number: text(form, 'id_number'),
    p_id_path: text(form, 'id_path'),
    p_accept_terms: form.get('terms') === 'on',
  });
  if (error) return failed(error);
  // Keep which version of the seller terms they accepted (the database just checked the box was ticked).
  const { error: termsError } = await supabase.rpc('vendor_record_terms', { p_version: vendorTermsVersion });
  if (termsError) console.error('terms version not recorded', termsError.message);

  const unsaved: string[] = [];
  const tin = text(form, 'tin');
  if (tin) {
    const sellerType = text(form, 'seller_type') === 'company' ? 'company' : 'individual';
    const { error: taxError } = await supabase.rpc('vendor_save_tax_info', {
      p: {
        business_type: sellerType,
        legal_name: text(form, 'legal_name') || text(form, 'owner_name'),
        tin,
        business_registration: text(form, 'business_registration'),
      },
    });
    if (taxError) unsaved.push('tax details');
  }
  const wallet = text(form, 'wallet');
  if (wallet) {
    const { error: payError } = await supabase.rpc('vendor_set_payout_account', {
      p_network: text(form, 'network'),
      p_wallet: wallet,
      p_name: text(form, 'wallet_name') || text(form, 'owner_name'),
    });
    if (payError) unsaved.push('payout account');
  }
  refresh();
  return done(
    unsaved.length
      ? `Application sent. Your ${unsaved.join(' and ')} didn’t save; add ${unsaved.length > 1 ? 'them' : 'it'} from your setup checklist.`
      : 'Application sent. We will review it and be in touch.',
  );
}

export async function saveStore(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_update_store', {
    p: {
      name: text(form, 'name'),
      tagline: text(form, 'tagline'),
      description: text(form, 'description'),
      phone: text(form, 'phone'),
      announcement: text(form, 'announcement'),
      returns_policy: text(form, 'returns_policy'),
      processing_days: text(form, 'processing_days') || '3',
      instagram: text(form, 'instagram'),
      website: text(form, 'website'),
    },
  });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Store details saved.');
}

/** Adds a section ("shelf") to the store, or renames one when `id` is given. */
export async function saveSection(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_save_section', {
    p: { id: text(form, 'id'), name: text(form, 'name') },
  });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Section saved.');
}

export async function deleteSection(id: string): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_delete_section', { p_id: id });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Section removed. Its products stay in your store.');
}

/** Puts a product in one of the store's sections (an empty section id takes it out). */
export async function setProductSection(productId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const section = text(form, 'section_id');
  const { error } = await supabase.rpc('vendor_set_product_section', { p_product_id: productId, p_section_id: section || null });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Section saved.');
}

/** Vacation mode: hides the store until it is resumed. Orders already placed still have to be packed. */
export async function setStorePaused(paused: boolean, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_set_paused', { p_paused: paused, p_note: text(form, 'note') || undefined });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done(paused ? 'Your store is paused. Shoppers can’t see it until you resume.' : 'Your store is back open.');
}

/** Records a logo or banner the browser has just uploaded to Storage. */
export async function saveStoreImage(kind: 'logo' | 'banner', path: string | null): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_update_store', {
    p: kind === 'logo' ? { logo_path: path ?? '' } : { banner_path: path ?? '' },
  });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done(path ? 'Image saved.' : 'Image removed.');
}

export async function saveProduct(productId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('vendor_save_product', { p: productFromForm(form, productId) });
  if (error) return failed(error);
  updateTag('catalog');
  const saved = data as unknown as { id: string; problems: string[] };
  if (!productId) redirect(`/vendor/products/${saved.id}?created=1`);
  refresh();
  return done(
    saved.problems.length
      ? `Saved. Before it can go on sale it still needs: ${saved.problems.join(', ')}.`
      : 'Saved. If you changed what the product is, we will look at it again before it goes back on sale.',
  );
}

export async function setStock(productId: string, sizeCode: string, _: ActionState, form: FormData): Promise<ActionState> {
  const quantity = Number(text(form, 'quantity'));
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, message: 'Enter a whole number, 0 or more.' };
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_set_stock', { p_product_id: productId, p_size_code: sizeCode, p_quantity: quantity });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Stock saved.');
}

export async function deleteProduct(productId: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_delete_product', { p_product_id: productId });
  if (error) return failed(error);
  updateTag('catalog');
  redirect('/vendor');
}

export type PhotoResult = { ok: boolean; message: string };

/** Records a photo the browser has just uploaded to Storage. */
export async function addProductPhoto(productId: string, path: string): Promise<PhotoResult> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_add_product_image', { p_product_id: productId, p_path: path });
  if (error) return { ok: false, message: error.code === '22023' || error.code === '42501' ? error.message : 'The photo couldn’t be saved.' };
  updateTag('catalog');
  refresh();
  return { ok: true, message: 'Photo added.' };
}

export async function removeProductPhoto(photoId: string): Promise<PhotoResult> {
  const supabase = await createUserSupabase();
  const { data: path, error } = await supabase.rpc('vendor_remove_product_image', { p_image_id: photoId });
  if (error) return { ok: false, message: error.code === '22023' || error.code === '42501' ? error.message : 'The photo couldn’t be removed.' };
  const { error: storageError } = await supabase.storage.from('product-images').remove([path]);
  if (storageError) console.error('Removing the photo file failed', storageError);
  updateTag('catalog');
  refresh();
  return { ok: true, message: 'Photo removed.' };
}

/** The vendor has put an order's items in a bag for Sleek Connect to collect. */
export async function markPacked(orderId: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_mark_packed', { p_order_id: orderId });
  if (error) return failed(error);
  refresh();
  return done('Marked as packed. We will collect it.');
}

export async function savePayoutAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_set_payout_account', {
    p_network: text(form, 'network'),
    p_wallet: text(form, 'wallet'),
    p_name: text(form, 'name'),
  });
  if (error) return failed(error);
  refresh();
  return done('Payout account saved.');
}

export async function sendMessage(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_send_message', { p_body: text(form, 'body') });
  if (error) return failed(error);
  refresh();
  return done('Sent. We will reply here.');
}

/** Adds products from a CSV file. Each product is saved the same way as the form, so every rule still applies. */
export async function importProducts(_: ActionState, form: FormData): Promise<ActionState> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose a CSV file first.' };
  if (file.size > 1_000_000) return { ok: false, message: 'That file is too big. Keep it under 1 MB.' };

  const { rows, problems } = readImport(await file.text(), await getCategories());
  if (rows.length === 0) return { ok: false, message: problems.slice(0, 5).join(' ') || `Add up to ${importLimit} products at a time.` };

  const supabase = await createUserSupabase();
  let added = 0;
  for (const row of rows) {
    const { data, error } = await supabase.rpc('vendor_save_product', { p: row.product });
    if (error) {
      problems.push(`Line ${row.line}: ${error.code === '22023' || error.code === '42501' ? error.message : 'could not be saved.'}`);
      continue;
    }
    added++;
    if (row.stock !== null) {
      const saved = data as unknown as { id: string };
      const { error: stockError } = await supabase.rpc('vendor_set_stock', { p_product_id: saved.id, p_size_code: '', p_quantity: row.stock });
      if (stockError) problems.push(`Line ${row.line}: saved, but the stock could not be set.`);
    }
  }
  if (added > 0) {
    updateTag('catalog');
    refresh();
  }
  const skipped = problems.length ? ` ${problems.slice(0, 6).join(' ')}${problems.length > 6 ? ` …and ${problems.length - 6} more.` : ''}` : '';
  return {
    ok: added > 0,
    message: added > 0
      ? `Added ${added} product${added === 1 ? '' : 's'}. Add photos to each one, then they go for approval.${skipped}`
      : `Nothing was added.${skipped}`,
  };
}

/** Sends the Mobile Money prompt for the yearly fee. The store opens when the provider confirms it. */
export async function payOnline(_: ActionState, form: FormData): Promise<ActionState> {
  const network = text(form, 'network') as MomoNetwork;
  const wallet = text(form, 'wallet').replace(/[^\d+]/g, '');
  if (!momoNetworks.some((n) => n.id === network)) return { ok: false, message: 'Choose your Mobile Money network.' };
  if (wallet.replace(/\D/g, '').length < 9) return { ok: false, message: 'Enter the Mobile Money number to charge.' };
  const result = await startSubscriptionPayment({ network, wallet });
  if (result.kind === 'requested') {
    // With a hosted payment page the vendor pays there, and comes back to their dashboard.
    if (result.checkoutUrl) redirect(result.checkoutUrl);
    return done(
      result.testMode
        ? 'Test mode: no prompt was sent. The store opens once the test payment is confirmed.'
        : 'Check your phone and approve the prompt. Your store opens as soon as the payment goes through.',
    );
  }
  return { ok: false, message: result.reason };
}

/** Accepts the current seller terms (asked again whenever they change). */
export async function acceptTerms(_: ActionState, form: FormData): Promise<ActionState> {
  if (form.get('accept') !== 'on') return { ok: false, message: 'Tick the box to accept the seller terms.' };
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_record_terms', { p_version: vendorTermsVersion });
  if (error) return failed(error);
  refresh();
  return done('Thank you. The seller terms are accepted.');
}

/** The vendor's legal name and tax number, needed before they can be paid. */
export async function saveTaxInfo(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_save_tax_info', {
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

/** The vendor's reply to a dispute about one of their products. */
export async function respondToDispute(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_respond_dispute', { p_id: id, p_response: text(form, 'response') });
  if (error) return failed(error);
  refresh();
  return done('Your reply has been sent.');
}

/** The seller's public reply to a review of one of their products. An empty reply removes it. */
export async function replyToReview(reviewId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const reply = text(form, 'reply');
  const { error } = await supabase.rpc('vendor_reply_to_review', { p_review_id: reviewId, p_reply: reply });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done(reply ? 'Your reply is public.' : 'Reply removed.');
}
