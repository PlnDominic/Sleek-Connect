'use server';

import { updateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createUserSupabase } from '@/lib/supabase/server';

export type DeleteState = { message: string } | null;

/**
 * Deletes the signed-in shopper's account (PRD FR-057). Return photos go first, through the Storage API (their files
 * can't be removed from the database); then the database function scrubs the orders and removes the account.
 */
export async function deleteAccount(_: DeleteState, form: FormData): Promise<DeleteState> {
  if (String(form.get('confirm') ?? '').trim().toUpperCase() !== 'DELETE') return { message: 'Type DELETE to confirm.' };

  const supabase = await createUserSupabase();
  const { data: blocker } = await supabase.rpc('account_deletion_blocker');
  if (blocker) return { message: blocker };

  const { data: paths } = await supabase.rpc('my_return_photo_paths');
  if (paths?.length) {
    const { data: removed, error } = await supabase.storage.from('return-photos').remove(paths);
    if (error || (removed?.length ?? 0) < paths.length) {
      console.error('Removing return photos failed', error);
      return { message: 'We couldn’t remove your return photos, so nothing was deleted. Please try again.' };
    }
  }

  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    if (error.code === '22023') return { message: error.message };
    console.error('delete_my_account failed', error);
    return { message: 'We couldn’t delete your account. Please try again.' };
  }

  // The shopper's reviews went with the account; product pages must stop showing them.
  updateTag('catalog');

  // The account is gone, so there is nothing for the server to sign out of; just forget the session here.
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Already invalid.
  }
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name.startsWith('sb-')) jar.delete(c.name);
  redirect('/account/deleted');
}
