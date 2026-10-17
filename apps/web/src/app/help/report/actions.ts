'use server';

import { createSupabase } from '@/lib/supabase/server';
import { UUID_PATTERN } from '@/lib/orders';
import type { Database } from '@/lib/supabase/database.types';

export type ReportState = { ok: true; caseNumber: string } | { ok: false; error: string } | null;
type Topic = Database['public']['Enums']['support_topic'];

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/** Opens a support case (PRD FR-055). The database checks every field and links the order when it can. */
export async function sendReport(_: ReportState, form: FormData): Promise<ReportState> {
  const token = text(form, 'order_token');
  const { data, error } = await createSupabase().rpc('create_support_case', {
    p_topic: text(form, 'topic') as Topic,
    p_name: text(form, 'name'),
    p_phone: text(form, 'phone'),
    p_message: text(form, 'message'),
    p_email: text(form, 'email'),
    p_order_token: UUID_PATTERN.test(token) ? token : undefined,
    p_order_number: text(form, 'order_number'),
  });
  if (error) {
    if (error.code === '22023') return { ok: false, error: error.message };
    if (error.code === '22P02') return { ok: false, error: 'Choose what your message is about.' };
    console.error(error);
    return { ok: false, error: 'That didn’t go through. Please try again.' };
  }
  return { ok: true, caseNumber: data };
}
