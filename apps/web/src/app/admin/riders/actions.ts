'use server';

import { refresh } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import { createUserSupabase } from '@/lib/supabase/server';

export async function saveRider(riderId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_save_rider', {
    p_id: riderId as string,
    p_name: text(form, 'name'),
    p_phone: text(form, 'phone'),
    p_vehicle: text(form, 'vehicle'),
    p_active: riderId ? form.get('active') === 'on' : true,
  });
  if (error) return failed(error);
  refresh();
  return done(riderId ? 'Rider updated.' : 'Rider added.');
}
