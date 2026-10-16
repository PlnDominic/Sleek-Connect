'use client';

import { useActionState, useEffect, useRef, useTransition, type FormEvent, type ReactNode } from 'react';
import type { ActionState } from '@/lib/admin/action-state';
import styles from './admin.module.css';

interface ActionFormProps {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  /** Asks before submitting, for actions that are hard to undo. */
  confirm?: string;
  /** Clears the fields after a successful submit (forms that add something). */
  resetOnSuccess?: boolean;
}

/**
 * A form bound to a server action, showing the action's result message underneath. Submits through a transition
 * rather than the `action` prop, so a failed submit keeps what staff typed instead of React clearing the form.
 */
export function ActionForm({ action, children, className, confirm, resetOnSuccess = false }: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    // Include the clicked button's name/value (e.g. bulk actions with several submit buttons).
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(data));
  };

  return (
    <form ref={formRef} onSubmit={submit} className={className ?? styles.form}>
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
