'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import styles from './SearchBox.module.css';

const KEY = 'sleek-connect:recent-searches:v1';
const MAX = 6;

function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function remember(query: string) {
  try {
    const next = [query, ...readRecent().filter((r) => r.toLowerCase() !== query.toLowerCase())].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: recent searches just aren't kept.
  }
}

/** Search input with this device's recent searches (PRD FR-012). */
export function SearchBox({ defaultValue = '', autoFocus = false, compact = false }: { defaultValue?: string; autoFocus?: boolean; compact?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // The query in the URL counts as a search the shopper made.
    if (defaultValue.trim().length >= 2) remember(defaultValue.trim());
  }, [defaultValue]);

  const go = (query: string) => {
    const q = query.trim();
    if (q.length < 2) return;
    remember(q);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(value);
  };

  return (
    <form role="search" action="/search" onSubmit={submit} className={compact ? styles.compact : styles.box}>
      <label htmlFor={id}>
        <Icon name="search" size={18} strokeWidth={2} />
        <span className="visually-hidden">Search products</span>
      </label>
      <input
        id={id}
        name="q"
        type="search"
        autoComplete="off"
        placeholder="Search serums, baby wash, gift sets..."
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => {
          setRecent(readRecent());
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-controls={`${id}-recent`}
      />
      {open && recent.length > 0 && !value && (
        <div id={`${id}-recent`} className={styles.recent} role="group" aria-label="Recent searches">
          <span className={styles.recentTitle}>Recent searches</span>
          {recent.map((r) => (
            <button key={r} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)}>
              {r}
            </button>
          ))}
          <button
            type="button"
            className={styles.clearRecent}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              try {
                localStorage.removeItem(KEY);
              } catch {}
              setRecent([]);
            }}
          >
            Clear recent searches
          </button>
        </div>
      )}
    </form>
  );
}
