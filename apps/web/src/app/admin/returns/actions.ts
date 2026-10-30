'use server';

import { updateTag } from 'next/cache';
import { failed, text, type ActionState } from '@/lib/admin/action-state';
import { flash } from '@/lib/admin/flash';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

const page = (caseNumber: string) => `/admin/returns/${caseNumber}`;

export async function decideReturn(returnId: string, caseNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const approve = form.get('decision') === 'approve';
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_decide_return', {
    p_return_id: returnId,
    p_approve: approve,
    p_note: text(form, 'note'),
  });
  if (error) return failed(error);
  flash(page(caseNumber), approve ? 'Return approved. The customer has been told.' : 'Return declined. The customer has been told why.');
}

export async function receiveReturn(returnId: string, caseNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const outcomes = [...form.entries()]
    .filter(([key]) => key.startsWith('outcome:'))
    .map(([key, value]) => ({ order_item_id: key.slice('outcome:'.length), outcome: String(value) }));
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_receive_return', {
    p_return_id: returnId,
    p_outcomes: outcomes as unknown as Json,
    p_note: text(form, 'note'),
  });
  if (error) return failed(error);
  // Restocked units go back on sale.
  updateTag('catalog');
  flash(page(caseNumber), 'Return received. The refund is now due.');
}

export async function markRefunded(returnId: string, caseNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_mark_return_refunded', {
    p_return_id: returnId,
    p_reference: text(form, 'reference'),
  });
  if (error) return failed(error);
  flash(page(caseNumber), 'Refund recorded. The customer has been told.');
}
