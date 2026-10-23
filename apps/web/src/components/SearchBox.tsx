'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
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

interface Suggestion {
  kind: 'product' | 'brand' | 'category';
  label: string;
  href: string;
}

const kindLabels: Record<Suggestion['kind'], string> = { product: 'Product', brand: 'Brand', category: 'Category' };

/** Search input with as-you-type suggestions and this device's recent searches (PRD FR-012). */
export function SearchBox({ defaultValue = '', autoFocus = false, compact = false }: { defaultValue?: string; autoFocus?: boolean; compact?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ q: string; items: Suggestion[] } | null>(null);
  const [active, setActive] = useState(-1);

  const typed = value.trim();
  // Only suggestions for what is in the box right now; older answers are ignored while a newer one loads.
  const suggestions = found && found.q === typed ? found.items : [];
  const showSuggestions = open && typed.length >= 2 && suggestions.length > 0;
  // The last row searches for the text as typed.
  const rows = showSuggestions ? suggestions.length + 1 : 0;

  useEffect(() => {
    if (typed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/suggest?q=${encodeURIComponent(typed)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((data: { suggestions?: Suggestion[] }) => setFound({ q: typed, items: data.suggestions ?? [] }))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed]);

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
  const choose = (item: Suggestion) => {
    remember(item.label);
    setOpen(false);
    router.push(item.href);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const picked = showSuggestions ? suggestions[active] : undefined;
    if (picked) choose(picked);
    else go(value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (rows > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => ((a + 1 + step + rows + 1) % (rows + 1)) - 1);
    }
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
        onChange={(e) => {
          setValue(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setRecent(readRecent());
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-controls={showSuggestions ? `${id}-suggestions` : `${id}-recent`}
        aria-activedescendant={showSuggestions && active >= 0 ? `${id}-option-${active}` : undefined}
      />
      {showSuggestions && (
        <div id={`${id}-suggestions`} className={styles.recent} role="listbox" aria-label="Suggestions">
          {suggestions.map((item, i) => (
            <div
              key={`${item.kind}-${item.href}`}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={active === i}
              className={`${styles.option} ${active === i ? styles.optionActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(item)}
            >
              <span>{item.label}</span>
              <span className={styles.optionKind}>{kindLabels[item.kind]}</span>
            </div>
          ))}
          <div
            id={`${id}-option-${suggestions.length}`}
            role="option"
            aria-selected={active === suggestions.length}
            className={`${styles.option} ${styles.optionAll} ${active === suggestions.length ? styles.optionActive : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(suggestions.length)}
            onClick={() => go(value)}
          >
            <span>See all results for “{typed}”</span>
          </div>
        </div>
      )}
      {open && recent.length > 0 && !value && !showSuggestions && (
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
