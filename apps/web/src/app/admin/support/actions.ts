'use server';

import { failed, text, type ActionState } from '@/lib/admin/action-state';
import { flash } from '@/lib/admin/flash';
import { createUserSupabase } from '@/lib/supabase/server';

export async function replyToCase(caseId: string, caseNumber: string, _: ActionState, form: FormData): Promise<ActionState> {
  const close = form.get('intent') !== 'reply';
  const reply = form.get('intent') === 'close' ? '' : text(form, 'reply');
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_reply_support_case', { p_case_id: caseId, p_reply: reply, p_close: close });
  if (error) return failed(error);
  flash(
    `/admin/support/${caseNumber}`,
    reply ? (close ? 'Reply sent and case closed.' : 'Reply sent to the customer.') : 'Case closed.',
  );
}
