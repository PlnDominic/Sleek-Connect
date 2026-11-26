'use server';

import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { failed, text, type ActionState } from '@/lib/admin/action-state';
import { createUserSupabase } from '@/lib/supabase/server';

/** Publishes or rejects a customer review. Published reviews appear on the product page, so the catalogue cache is refreshed. */
export async function moderateReview(id: string, view: string, _: ActionState, form: FormData): Promise<ActionState> {
  const decision = form.get('intent') === 'publish' ? 'publish' : 'reject';
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_moderate_review', { p_id: id, p_decision: decision, p_note: text(form, 'note') });
  if (error) return failed(error);
  updateTag('catalog');
  const message = decision === 'publish' ? 'Review published.' : 'Review rejected. The customer will see your reason.';
  redirect(`/admin/reviews?view=${encodeURIComponent(view)}&done=${encodeURIComponent(message)}`);
}
