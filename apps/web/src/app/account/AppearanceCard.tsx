'use client';

import { useEffect, useSyncExternalStore } from 'react';
import styles from './account.module.css';

type Choice = 'light' | 'dark' | 'auto';
const KEY = 'sc-theme';
const options: { value: Choice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
];

/** Applies the choice to the page now and keeps it on this device. Auto is the default; it follows the phone or computer setting. */
function apply(choice: Choice) {
  const dark = choice === 'dark' || (choice === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

const EVENT = 'sc-theme-change';

function read(): Choice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** Light, Dark or Auto for the whole store (the same switch the mobile app has on its Account page). */
export function AppearanceCard() {
  const choice = useSyncExternalStore(subscribe, read, () => 'auto' as Choice);

  // While on Auto, follow the device when its setting changes.
  useEffect(() => {
    if (choice !== 'auto') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const follow = () => apply('auto');
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [choice]);

  const pick = (next: Choice) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <section className={styles.infoCard} aria-labelledby="ov-appearance">
      <div className={styles.infoHead}>
        <h2 id="ov-appearance">Appearance</h2>
      </div>
      <div className={styles.infoBody}>
        <div role="radiogroup" aria-label="Appearance" className={styles.segmented}>
          {options.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={choice === o.value} data-on={choice === o.value || undefined} onClick={() => pick(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        <span>{choice === 'auto' ? 'Follows your device setting.' : choice === 'dark' ? 'Dark on this device.' : 'Light on this device.'}</span>
      </div>
    </section>
  );
}
