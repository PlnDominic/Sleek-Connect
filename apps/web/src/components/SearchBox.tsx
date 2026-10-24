'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { asImageKey, formatPrice, type ProductKind } from '@sleek/shared';
import type { LiveProduct } from '@/app/api/search/live/route';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';
import styles from './SearchBox.module.css';

const KEY = 'sleek-connect:recent-searches:v1';
const MAX = 6;
/** How long to wait after the last keystroke before searching. */
const TYPING_PAUSE_MS = 120;
/** The same pause on the search page, which reloads the whole results grid. */
const PAGE_PAUSE_MS = 280;

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

interface LiveResult {
  products: LiveProduct[];
  total: number;
  suggestions: Suggestion[];
}

const kindLabels: Record<Suggestion['kind'], string> = { product: 'Product', brand: 'Brand', category: 'Category' };

/** One selectable row in the dropdown: a product, or a brand or category that matches. */
type Row = { key: string; href: string; label: string; remember: string };

/**
 * Search input. As you type it shows the best matching products (with picture and price) plus matching brands and
 * categories, and with `live` (the search page) the results grid below also updates by itself, without pressing
 * Enter (PRD FR-012). Also lists this device's recent searches.
 */
export function SearchBox({
  defaultValue = '',
  autoFocus = false,
  compact = false,
  live = false,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  compact?: boolean;
  /** On the search page: the results grid below follows what is typed. */
  live?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ q: string; data: LiveResult } | null>(null);
  const [active, setActive] = useState(-1);
  const cache = useRef(new Map<string, LiveResult>());

  const typed = value.trim();
  // Only results for what is in the box right now; older answers are ignored while a newer one loads.
  const result = found && found.q === typed ? found.data : null;
  const searching = typed.length >= 2 && !result;
  const showResults = open && typed.length >= 2;

  const rows: Row[] = result
    ? [
        ...result.products.map((p) => ({ key: `p-${p.slug}`, href: `/products/${p.slug}`, label: p.name, remember: p.name })),
        ...result.suggestions.map((s) => ({ key: `${s.kind}-${s.href}`, href: s.href, label: s.label, remember: s.label })),
      ]
    : [];
  // The last row searches for the text as typed.
  const rowCount = showResults && result ? rows.length + 1 : 0;

  useEffect(() => {
    if (typed.length < 2) return;
    const cached = cache.current.get(typed.toLowerCase());
    if (cached) {
      // Already fetched in this visit: show it straight away.
      const timer = setTimeout(() => setFound({ q: typed, data: cached }), 0);
      return () => clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/live?q=${encodeURIComponent(typed)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: LiveResult | null) => {
          if (!data) return;
          cache.current.set(typed.toLowerCase(), data);
          setFound({ q: typed, data });
        })
        .catch(() => {});
    }, TYPING_PAUSE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed]);

  // On the search page the results grid follows what is typed (replacing the URL, so Back still leaves the page).
  useEffect(() => {
    if (!live) return;
    const current = new URLSearchParams(window.location.search).get('q')?.trim() ?? '';
    const wanted = typed.length >= 2 ? typed : '';
    if (wanted === current) return;
    const timer = setTimeout(() => {
      router.replace(wanted ? `/search?q=${encodeURIComponent(wanted)}` : '/search', { scroll: false });
    }, PAGE_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed, live, router]);

  useEffect(() => {
    // A search that arrives in the URL counts as a search the shopper made. (Not while typing live: every pause
    // would otherwise be saved as a recent search.)
    if (!live && defaultValue.trim().length >= 2) remember(defaultValue.trim());
  }, [defaultValue, live]);

  const go = (query: string) => {
    const q = query.trim();
    if (q.length < 2) return;
    remember(q);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };
  const choose = (row: Row) => {
    remember(typed);
    setOpen(false);
    router.push(row.href);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const picked = showResults ? rows[active] : undefined;
    if (picked) choose(picked);
    else go(value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (rowCount > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => ((a + 1 + step + rowCount + 1) % (rowCount + 1)) - 1);
    }
  };

  const productRows = result?.products ?? [];
  const extraRows = result?.suggestions ?? [];

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
        aria-controls={showResults ? `${id}-results` : `${id}-recent`}
        aria-activedescendant={showResults && active >= 0 ? `${id}-option-${active}` : undefined}
      />
      {searching && <span className={styles.spinner} aria-hidden="true" />}

      {showResults && (
        <div id={`${id}-results`} className={styles.recent} role="listbox" aria-label="Search results">
          {!result && <p className={styles.status}>Searching…</p>}
          {result && rows.length === 0 && (
            <p className={styles.status}>
              No matches for “{typed}” yet. Press Enter to search everything, or try another word.
            </p>
          )}
          {productRows.length > 0 && <span className={styles.recentTitle}>Products</span>}
          {productRows.map((p, i) => (
            <a
              key={p.slug}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={active === i}
              href={`/products/${p.slug}`}
              className={`${styles.product} ${active === i ? styles.optionActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => {
                e.preventDefault();
                choose(rows[i]);
              }}
            >
              <ProductImage
                image={asImageKey(p.image)}
                photo={p.photo}
                tint={p.tint}
                kind={p.kind as ProductKind}
                alt=""
                sizes="48px"
                className={styles.thumb}
              />
              <span className={styles.productText}>
                <span className={styles.productName}>{p.name}</span>
                <span className={styles.productMeta}>{[p.brand, p.category].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={styles.productPrice}>
                {formatPrice(p.price)}
                {p.was !== undefined && <s>{formatPrice(p.was)}</s>}
                {p.inStock === false && <em>Sold out</em>}
              </span>
            </a>
          ))}
          {extraRows.length > 0 && <span className={styles.recentTitle}>Brands and categories</span>}
          {extraRows.map((s, j) => {
            const i = productRows.length + j;
            return (
              <div
                key={`${s.kind}-${s.href}`}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={active === i}
                className={`${styles.option} ${active === i ? styles.optionActive : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(rows[i])}
              >
                <span>{s.label}</span>
                <span className={styles.optionKind}>{kindLabels[s.kind]}</span>
              </div>
            );
          })}
          {result && (
            <div
              id={`${id}-option-${rows.length}`}
              role="option"
              aria-selected={active === rows.length}
              className={`${styles.option} ${styles.optionAll} ${active === rows.length ? styles.optionActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(rows.length)}
              onClick={() => go(value)}
            >
              <span>
                {result.total > productRows.length
                  ? `See all ${result.total} results for “${typed}”`
                  : `See all results for “${typed}”`}
              </span>
            </div>
          )}
        </div>
      )}
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
