'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition, type FormEvent } from 'react';
import type { ActionState } from '@/lib/admin/action-state';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { applyForStore } from './actions';
import styles from './vendor.module.css';

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 5 * 1024 * 1024;

const idTypes = [
  ['ghana_card', 'Ghana Card'],
  ['passport', 'Passport'],
  ['voters_id', 'Voter’s ID'],
  ['drivers_license', 'Driver’s licence'],
] as const;

/**
 * The store application: store name, the owner's full name, email and phone, and an ID (type, number and a photo or
 * scan). The ID file goes straight from the browser to a private bucket; only its path is sent with the form.
 */
export function ApplyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(applyForStore, null);
  const [, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('id_file');
    if (!(file instanceof File) || file.size === 0) return setProblem('Upload a photo or scan of your ID.');
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES) return setProblem('Use a JPEG, PNG, WebP or PDF under 5 MB.');
    setProblem(null);
    setUploading(true);
    startTransition(async () => {
      const supabase = createBrowserSupabase();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setUploading(false);
        return setProblem('Sign in again to continue.');
      }
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
      const path = `${auth.user.id}/id-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('vendor-ids').upload(path, file, { contentType: file.type });
      setUploading(false);
      if (error) return setProblem('The ID didn’t upload. Check your connection and try again.');
      data.delete('id_file');
      data.set('id_path', path);
      action(data);
    });
  };

  const busy = pending || uploading;
  const message = problem ?? (state && !state.ok ? state.message : null);
  return (
    <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={busy} className={styles.fieldset}>
        <label className={styles.field}>
          <span>Store name</span>
          <input name="name" required minLength={2} maxLength={60} autoComplete="organization" />
        </label>
        <label className={styles.field}>
          <span>Your full name</span>
          <input name="owner_name" required minLength={2} maxLength={80} autoComplete="name" />
          <small>As it appears on your ID.</small>
        </label>
        <label className={styles.field}>
          <span>Email</span>
          <input name="email" type="email" required defaultValue={email} autoComplete="email" />
        </label>
        <label className={styles.field}>
          <span>Phone number</span>
          <input name="phone" type="tel" required autoComplete="tel" placeholder="024 123 4567" />
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>ID type</span>
            <select name="id_type" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {idTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>ID number</span>
            <input name="id_number" required minLength={5} maxLength={30} autoComplete="off" />
          </label>
        </div>
        <label className={styles.field}>
          <span>Photo or scan of your ID</span>
          <input name="id_file" type="file" required accept={TYPES.join(',')} />
          <small>JPEG, PNG, WebP or PDF, up to 5 MB. Only our team can see it.</small>
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="terms" required />
          <span>
            I agree to the <Link href="/sell#terms">vendor terms</Link>
          </span>
        </label>
        <button type="submit" className={styles.primary}>
          {uploading ? 'Uploading your ID…' : pending ? 'Sending…' : 'Send application'}
        </button>
      </fieldset>
      {message && (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      )}
    </form>
  );
}
