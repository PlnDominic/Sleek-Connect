'use client';

import { useActionState, useEffect, useRef, useTransition, type FormEvent, type ReactNode } from 'react';
import type { ActionState } from '@/lib/admin/action-state';
import styles from './vendor.module.css';

/** A form bound to a server action that keeps what was typed when the action fails and shows its message. */
export function VendorForm({
  action,
  children,
  confirm,
  resetOnSuccess = false,
  className,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  confirm?: string;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(data));
  };

  return (
    <form ref={ref} onSubmit={submit} className={className ?? styles.form}>
      <fieldset disabled={pending} className={styles.fieldset}>
        {children}
      </fieldset>
      {state && (
        <p role={state.ok ? 'status' : 'alert'} className={state.ok ? styles.success : styles.error}>
          {state.message}
        </p>
      )}
    </form>
  );
}
