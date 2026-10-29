'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import { can, requireStaffPage } from '@/lib/admin/session';
import { emailProvider } from '@/lib/notifications/providers';
import { rateLimit } from '@/lib/rate-limit';
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

/**
 * Sends one message through the email provider the store is set up with (Gmail, when EMAIL_PROVIDER=gmail), so an admin
 * can see that order and vendor emails will really reach people. Admins only; a few tries a minute.
 */
export async function sendTestEmail(_: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaffPage();
  if (!staff || !can(staff.role, 'settings.edit')) return { ok: false, message: 'Only admins can send a test email.' };
  const to = text(form, 'to');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.length > 254) return { ok: false, message: 'Enter the email address to send the test to.' };
  if (!rateLimit({ key: `test-email:${staff.email}`, limit: 5, windowMs: 60_000 }).allowed) {
    return { ok: false, message: 'That is a lot of test emails. Wait a minute and try again.' };
  }
  const provider = emailProvider();
  if (!provider) {
    return { ok: false, message: 'Email isn’t set up. Set EMAIL_PROVIDER=gmail, GMAIL_USER and GMAIL_APP_PASSWORD on the server, then redeploy.' };
  }
  try {
    await provider.send(to, {
      subject: 'Sleek Connect Store: test email',
      text: `This is a test message from Sleek Connect Store, sent by ${staff.email ?? 'an admin'}. If you can read it, order and vendor emails will reach people.`,
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'unknown error';
    console.error('Test email failed', reason);
    return {
      ok: false,
      message: /535|Invalid login|Username and Password|BadCredentials/i.test(reason)
        ? 'Gmail refused the sign-in. Use an App Password (Google Account → Security → 2-Step Verification → App passwords), not the account password.'
        : `The ${provider.name} email provider failed: ${reason}`,
    };
  }
  return done(`Test email sent to ${to} through ${provider.name}. Check that inbox (and spam).`);
}
