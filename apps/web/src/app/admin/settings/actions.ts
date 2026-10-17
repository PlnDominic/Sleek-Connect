'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

const numbers = ['return_window_days', 'reservation_minutes', 'low_stock_threshold', 'expiry_alert_days', 'max_delivery_attempts'];
const texts = ['support_phone', 'support_whatsapp', 'support_email', 'support_hours'];

export async function saveSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const p: Record<string, string | boolean> = { require_delivery_code: form.get('require_delivery_code') === 'on' };
  for (const key of numbers) if (text(form, key)) p[key] = text(form, key);
  // Empty text clears the setting.
  for (const key of texts) p[key] = text(form, key);

  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_update_settings', { p: p as Json });
  if (error) return failed(error);
  // The help centre and product pages show the contacts and the return window.
  updateTag('catalog');
  refresh();
  return done('Settings saved.');
}
