'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import type { ActionState } from '@/lib/admin/action-state';
import { momoNetworks } from '@sleek/shared';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { applyForStore, checkStoreName, type NameCheck } from './actions';
import styles from './vendor.module.css';

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 5 * 1024 * 1024;

const idTypes = [
  ['ghana_card', 'Ghana Card'],
  ['passport', 'Passport'],
  ['voters_id', 'Voter’s ID'],
  ['drivers_license', 'Driver’s licence'],
] as const;

const steps = [
  { id: 'name', title: 'Name your store', hint: 'Pick a name shoppers will remember. You can change it later.' },
  { id: 'you', title: 'About you', hint: 'Who is behind the store, and how we reach you.' },
  { id: 'verify', title: 'Verify', hint: 'We check every seller’s identity before a store goes live.' },
  { id: 'pay', title: 'Get paid', hint: 'Where we send your earnings. You can finish this later.' },
  { id: 'review', title: 'Review and agree', hint: 'Check your details, then send your application.' },
] as const;

type Availability = { state: 'idle' | 'checking' } | ({ state: 'done' } & NameCheck);

/**
 * "Open your store": a five-step wizard (name with a live availability check, about you, ID, payout, review). All the
 * steps live in one form; only the current one is shown, and each is checked before moving on. The ID file goes straight
 * from the browser to a private bucket; only its path is sent with the form.
 */
export function StoreWizard({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(applyForStore, null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [availability, setAvailability] = useState<Availability>({ state: 'idle' });
  const [sellerType, setSellerType] = useState<'individual' | 'company'>('individual');
  const [summary, setSummary] = useState<Record<string, string>>({});
  const checkId = useRef(0);

  // Check the name shortly after the shopper stops typing.
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    const id = ++checkId.current;
    const timer = setTimeout(() => {
      setAvailability({ state: 'checking' });
      checkStoreName(trimmed).then((result) => {
        if (id === checkId.current) setAvailability({ state: 'done', ...result });
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [name]);

  const nameOk = availability.state === 'done' && availability.ok && name.trim().length >= 2;

  const readSummary = () => {
    const data = new FormData(formRef.current ?? undefined);
    const get = (key: string) => String(data.get(key) ?? '').trim();
    const file = data.get('id_file');
    setSummary({
      name: get('name'),
      owner: get('owner_name'),
      email: get('email'),
      phone: get('phone'),
      seller: get('seller_type') === 'company' ? 'Registered business' : 'Individual',
      idType: idTypes.find(([value]) => value === get('id_type'))?.[1] ?? '',
      idFile: file instanceof File ? file.name : '',
      payout: get('wallet') ? `${momoNetworks.find((n) => n.id === get('network'))?.label ?? ''} · ${get('wallet')}` : 'Not added yet',
      tin: get('tin') ? 'Added' : 'Not added yet',
    });
  };

  // Validate only the fields of the step being left, with the browser's own messages.
  const stepValid = () => {
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-step="${steps[step].id}"]`);
    if (!panel) return true;
    for (const field of panel.querySelectorAll<HTMLInputElement>('input, select, textarea')) {
      if (!field.reportValidity()) return false;
    }
    if (steps[step].id === 'name' && !nameOk) {
      setProblem(
        availability.state === 'done' && !availability.ok
          ? availability.reason ?? 'Choose a different store name.'
          : 'Wait a moment while we check that name.',
      );
      return false;
    }
    return true;
  };

  const next = () => {
    setProblem(null);
    if (!stepValid()) return;
    const target = Math.min(step + 1, steps.length - 1);
    if (steps[target].id === 'review') readSummary();
    setStep(target);
    formRef.current?.scrollIntoView({ block: 'nearest' });
  };

  const back = () => {
    setProblem(null);
    setStep(Math.max(step - 1, 0));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (steps[step].id !== 'review') return next();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('id_file');
    if (!(file instanceof File) || file.size === 0) {
      setStep(2);
      return setProblem('Upload a photo or scan of your ID.');
    }
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES) {
      setStep(2);
      return setProblem('Use a JPEG, PNG, WebP or PDF under 5 MB.');
    }
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
  const current = steps[step];

  return (
    <form ref={formRef} onSubmit={submit} className={styles.form} noValidate>
      <ol className={styles.wizardSteps} aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.id} data-current={i === step || undefined} data-done={i < step || undefined}>
            <span aria-hidden="true">{i < step ? '✓' : i + 1}</span>
            <b>{s.title}</b>
            {i === step && <span className="visually-hidden">(current step)</span>}
          </li>
        ))}
      </ol>
      <div className={styles.stepHead} aria-live="polite">
        <span>
          Step {step + 1} of {steps.length}
        </span>
        <h2>{current.title}</h2>
        <p>{current.hint}</p>
      </div>

      <fieldset disabled={busy} className={styles.fieldset}>
        <div data-step="name" hidden={current.id !== 'name'} className={styles.fieldset}>
          <label className={styles.field}>
            <span>Store name</span>
            <input
              name="name"
              required
              minLength={2}
              maxLength={60}
              autoComplete="organization"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setAvailability({ state: 'idle' });
                setProblem(null);
              }}
              aria-describedby="name-status"
            />
          </label>
          <p id="name-status" aria-live="polite" className={styles.nameStatus} data-ok={nameOk || undefined}>
            {name.trim().length < 2
              ? '2 to 60 characters. Letters, numbers and simple punctuation.'
              : availability.state !== 'done'
                ? 'Checking that name…'
                : availability.ok
                  ? `✓ “${name.trim()}” is available${availability.slug ? ` · your address will be /store/${availability.slug}` : ''}`
                  : `${availability.reason ?? 'That name isn’t available.'}`}
            {availability.state === 'done' && !availability.ok && availability.suggestion && (
              <>
                {' '}
                <button type="button" className={styles.linkButton} onClick={() => setName(availability.suggestion ?? '')}>
                  Try “{availability.suggestion}”
                </button>
              </>
            )}
          </p>
        </div>

        <div data-step="you" hidden={current.id !== 'you'} className={styles.fieldset}>
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
          <label className={styles.field}>
            <span>You sell as</span>
            <select name="seller_type" value={sellerType} onChange={(e) => setSellerType(e.target.value as 'individual' | 'company')}>
              <option value="individual">An individual</option>
              <option value="company">A registered business</option>
            </select>
          </label>
          {sellerType === 'company' && (
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Registered business name</span>
                <input name="legal_name" required maxLength={120} autoComplete="off" />
              </label>
              <label className={styles.field}>
                <span>Registration number</span>
                <input name="business_registration" maxLength={40} autoComplete="off" />
              </label>
            </div>
          )}
        </div>

        <div data-step="verify" hidden={current.id !== 'verify'} className={styles.fieldset}>
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
        </div>

        <div data-step="pay" hidden={current.id !== 'pay'} className={styles.fieldset}>
          <p className={styles.muted}>
            Earnings are paid to Mobile Money after each order is delivered. Add your details now, or skip this step and finish it from your setup
            checklist.
          </p>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Mobile Money network</span>
              <select name="network" defaultValue="mtn">
                {momoNetworks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Mobile Money number</span>
              <input name="wallet" type="tel" autoComplete="off" placeholder="024 123 4567" />
            </label>
          </div>
          <label className={styles.field}>
            <span>Name on that wallet</span>
            <input name="wallet_name" maxLength={80} autoComplete="off" />
          </label>
          <label className={styles.field}>
            <span>Tax Identification Number (TIN)</span>
            <input name="tin" maxLength={20} autoComplete="off" />
            <small>For an individual this is your Ghana Card number. Needed before payouts.</small>
          </label>
        </div>

        <div data-step="review" hidden={current.id !== 'review'} className={styles.fieldset}>
          <dl className={styles.summary}>
            <dt>Store</dt>
            <dd>{summary.name}</dd>
            <dt>Owner</dt>
            <dd>
              {summary.owner} · {summary.seller}
            </dd>
            <dt>Contact</dt>
            <dd>
              {summary.email} · {summary.phone}
            </dd>
            <dt>ID</dt>
            <dd>
              {summary.idType}
              {summary.idFile ? ` · ${summary.idFile}` : ''}
            </dd>
            <dt>Payout</dt>
            <dd>{summary.payout}</dd>
            <dt>TIN</dt>
            <dd>{summary.tin}</dd>
          </dl>
          <p className={styles.muted}>
            After you send this, we review your application. Meanwhile you can set up your store, add products as drafts and write your story. Your store
            goes live once we approve it and the yearly fee is paid.
          </p>
          <label className={styles.check}>
            <input type="checkbox" name="terms" required />
            <span>
              I’m 18 or older and I agree to the <Link href="/sell/terms" target="_blank">seller terms</Link> and the <Link href="/sell/standards" target="_blank">product standards</Link>
            </span>
          </label>
        </div>

        <div className={styles.wizardButtons}>
          {step > 0 && (
            <button type="button" className={styles.secondary} onClick={back}>
              Back
            </button>
          )}
          {current.id === 'review' ? (
            <button type="submit" className={styles.primary}>
              {uploading ? 'Uploading your ID…' : pending ? 'Sending…' : 'Send application'}
            </button>
          ) : (
            <button type="button" className={styles.primary} onClick={next}>
              Continue
            </button>
          )}
        </div>
      </fieldset>

      {message && (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      )}
    </form>
  );
}
