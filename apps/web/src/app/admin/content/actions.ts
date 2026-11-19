'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import { flash } from '@/lib/admin/flash';
import { createUserSupabase } from '@/lib/supabase/server';

/**
 * A `datetime-local` value as a timestamp. Accra keeps GMT all year (no daylight saving), so the time staff type is
 * already UTC.
 */
const gmt = (value: string) => (value ? `${value}:00Z` : '');

export async function saveBanner(bannerId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_save_banner', {
    p: {
      id: bannerId ?? '',
      placement: text(form, 'placement'),
      kicker: text(form, 'kicker'),
      // Keep the line breaks staff typed (the hero title shows them); drop Windows carriage returns.
      title: text(form, 'title').replace(/\r/g, ''),
      body: text(form, 'body').replace(/\r/g, ''),
      cta_label: text(form, 'cta_label'),
      cta_href: text(form, 'cta_href'),
      secondary_cta_label: text(form, 'secondary_cta_label'),
      secondary_cta_href: text(form, 'secondary_cta_href'),
      image_key: text(form, 'image_key'),
      theme: text(form, 'theme'),
      countdown_to: gmt(text(form, 'countdown_to')),
      starts_at: gmt(text(form, 'starts_at')),
      ends_at: gmt(text(form, 'ends_at')),
      sort_order: text(form, 'sort_order'),
      is_active: form.get('is_active') === 'on',
    },
  });
  if (error) return failed(error);
  updateTag('catalog');
  if (!bannerId) flash('/admin/content', 'Banner added.');
  refresh();
  return done('Banner saved.');
}

export async function deleteBanner(bannerId: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_delete_banner', { p_id: bannerId });
  if (error) return failed(error);
  updateTag('catalog');
  flash('/admin/content', 'Banner deleted.');
}

export async function saveCollection(slot: string, _: ActionState, form: FormData): Promise<ActionState> {
  const slugs = text(form, 'slugs')
    .split(/[\n,]/)
    .map((s) => s.trim().replace(/^\/?products\//, ''))
    .filter(Boolean);
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_collection', { p_slot: slot, p_slugs: slugs });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done(slugs.length ? `Saved ${slugs.length} product${slugs.length === 1 ? '' : 's'}.` : 'Collection emptied.');
}
