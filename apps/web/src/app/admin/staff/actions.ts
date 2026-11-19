'use server';

import { refresh } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import type { StaffRole } from '@/lib/admin/session';
import { createUserSupabase } from '@/lib/supabase/server';

export async function setStaff(email: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_staff', {
    p_email: email ?? text(form, 'email'),
    p_role: text(form, 'role') as StaffRole,
    p_active: email ? form.get('active') === 'on' : true,
  });
  if (error) return failed(error);
  refresh();
  return done(email ? 'Saved.' : 'Added. They can now sign in at /admin with that email address.');
}

/** Switches a staff member on or off, keeping their role. */
export async function setStaffActive(email: string, role: StaffRole, active: boolean): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_staff', { p_email: email, p_role: role, p_active: active });
  if (error) return failed(error);
  refresh();
  return done(active ? 'They can sign in again.' : 'They can no longer sign in to the admin console.');
}
