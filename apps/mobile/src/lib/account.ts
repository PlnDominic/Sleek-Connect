import { supabase } from './supabase';

/**
 * Deletes the signed-in shopper's account, the same way as on the website: files first (so nothing is left behind if
 * one can't be removed), then the account itself. Orders stay, anonymised, because the store must keep its sales records.
 * Returns a message for the shopper when it can't go ahead, or null once the account is gone.
 */
export async function deleteMyAccount(): Promise<string | null> {
  const { data: blocker } = await supabase.rpc('account_deletion_blocker');
  if (blocker) return blocker as string;

  const { data: paths } = await supabase.rpc('my_return_photo_paths');
  const photos = (paths as string[] | null) ?? [];
  if (photos.length > 0) {
    const { data: removed, error } = await supabase.storage.from('return-photos').remove(photos);
    if (error || (removed?.length ?? 0) < photos.length) return 'We couldn’t remove your return photos, so nothing was deleted. Please try again.';
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: idFiles } = await supabase.storage.from('vendor-ids').list(user.id);
    if (idFiles?.length) {
      const { error } = await supabase.storage.from('vendor-ids').remove(idFiles.map((f) => `${user.id}/${f.name}`));
      if (error) return 'We couldn’t remove your ID file, so nothing was deleted. Please try again.';
    }
  }

  const { error } = await supabase.rpc('delete_my_account');
  if (error) return error.code === '22023' ? error.message : 'We couldn’t delete your account. Please try again.';
  // The account is gone, so there is nothing to sign out of on the server; just forget the session on this phone.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  return null;
}
