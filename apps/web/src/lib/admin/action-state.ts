import type { PostgrestError } from '@supabase/supabase-js';

export type ActionState = { ok: boolean; message: string } | null;

/** Turns a database error into a message for staff. Rule violations carry their own wording (22023, 42501). */
export function failed(error: PostgrestError | null, fallback = 'That didn’t work. Please try again.'): ActionState {
  if (error && (error.code === '22023' || error.code === '42501')) return { ok: false, message: error.message };
  if (error) console.error(error);
  return { ok: false, message: fallback };
}

export const done = (message: string): ActionState => ({ ok: true, message });

export const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
