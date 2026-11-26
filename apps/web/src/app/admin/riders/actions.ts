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

/** Switches a rider on or off without touching their details. */
export async function setRiderActive(rider: { id: string; name: string; phone: string; vehicle: string }, active: boolean): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_save_rider', { p_id: rider.id, p_name: rider.name, p_phone: rider.phone, p_vehicle: rider.vehicle, p_active: active });
  if (error) return failed(error);
  refresh();
  return done(active ? 'Rider is active.' : 'Rider is inactive.');
}
