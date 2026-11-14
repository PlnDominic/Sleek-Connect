'use client';

import { usePathname } from 'next/navigation';

/**
 * "Skip to main content", the first thing a keyboard or screen-reader user reaches on every page. It stays out of sight until it is
 * focused. Every page's `<main>` carries the target id in its markup, so the link works even before scripts load; the script only
 * moves keyboard focus into the content. The admin console has its own skip link.
 */
export function SkipLink() {
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) return null;
  return (
    <a
      href="#main-content"
      className="skip-link"
      onClick={(event) => {
        const main = document.getElementById('main-content');
        if (!main) return;
        event.preventDefault();
        main.setAttribute('tabindex', '-1');
        main.focus();
        main.scrollIntoView();
      }}
    >
      Skip to main content
    </a>
  );
}
