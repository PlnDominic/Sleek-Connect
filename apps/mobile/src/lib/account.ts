import { siteAddress, siteConfigured } from './site';
import { supabase } from './supabase';

/**
 * Deletes the signed-in shopper's account, the same way as on the website: files first (so nothing is left behind if
 * one can't be removed), then the account itself. Orders stay, anonymised, because the store must keep its sales records.
 * Returns a message for the shopper when it can't go ahead, or null once the account is gone.
 */
export async function deleteMyAccount(): Promise<string | null> {
  // Apple requires that deleting an account also ends the Apple ID's link with the app. Do it first; if Apple can't be reached, nothing is deleted.
  const { data: session } = await supabase.auth.getSession();
  const isApple = session.session?.user.app_metadata.provider === 'apple' || session.session?.user.identities?.some((i) => i.provider === 'apple');
  if (isApple && siteConfigured) {
    const reply = await fetch(siteAddress('/api/account/apple-revoke'), { method: 'POST', headers: { Authorization: `Bearer ${session.session?.access_token}` } }).catch(() => null);
    if (!reply || !reply.ok) return 'We couldn’t reach Apple to end your Apple sign-in, so nothing was deleted. Please try again.';
  }

  const { data: blocker } = await supabase.rpc('account_deletion_blocker');
  if (blocker) return blocker as string;

  const { data: paths } = await supabase.rpc('my_return_photo_paths');
  const photos = (paths as string[] | null) ?? [];
  if (photos.length > 0) {
    const { data: removed, error } = await supabase.storage.from('return-photos').remove(photos);
    if (error || (removed?.length ?? 0) < photos.length) return 'We couldn’t remove your return photos, so nothing was deleted. Please try again.';
  }

  const { error } = await supabase.rpc('delete_my_account');
  if (error) return error.code === '22023' ? error.message : 'We couldn’t delete your account. Please try again.';
  // The account is gone, so there is nothing to sign out of on the server; just forget the session on this phone.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  return null;
}
