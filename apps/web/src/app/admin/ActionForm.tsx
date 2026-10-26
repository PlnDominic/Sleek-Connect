'use client';

import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import type { ActionState } from '@/lib/admin/action-state';
import { Toast } from './Toast';
import styles from './admin.module.css';

interface ActionFormProps {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  /** Lets checkboxes elsewhere on the page join this form with their `form` attribute. */
  id?: string;
  /** Asks before submitting, for actions that are hard to undo. A button can ask on its own with `data-confirm`. */
  confirm?: string;
  /** Clears the fields after a successful submit (forms that add something). */
  resetOnSuccess?: boolean;
  /** Warns before leaving the page while there are unsaved changes (long editing forms). */
  guard?: boolean;
}

/**
 * A form bound to a server action. The result shows as a message at the bottom of the screen (see Toast). Submits through a transition rather than the `action` prop, so a failed submit keeps what staff
 * typed instead of React clearing the form.
 */
export function ActionForm({ action, children, className, id, confirm, resetOnSuccess = false, guard = false }: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  // The result that was showing when the form was last edited. A newer successful result means the edits are saved.
  const [editedAt, setEditedAt] = useState<{ result: ActionState } | null>(null);
  const dirty = editedAt !== null && !(state?.ok && state !== editedAt.result);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  useEffect(() => {
    if (!guard || !dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [guard, dirty]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const question = submitter?.dataset.confirm ?? confirm;
    if (question && !window.confirm(question)) return;
    // Include the clicked button's name/value (e.g. bulk actions with several submit buttons).
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  };

  return (
    <form
      id={id}
      ref={formRef}
      onSubmit={submit}
      onInput={guard ? () => setEditedAt((e) => (dirty && e ? e : { result: state })) : undefined}
      className={className ?? styles.form}
    >
      <fieldset disabled={pending} className={styles.fieldset}>
        {children}
      </fieldset>
      {guard && dirty && !pending && <p className={styles.unsaved}>You have unsaved changes.</p>}
      <Toast state={state} />
    </form>
  );
}
