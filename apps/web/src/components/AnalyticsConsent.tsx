'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useSyncExternalStore } from 'react';
import styles from './analytics-consent.module.css';

/** Google Tag Manager container. Set NEXT_PUBLIC_GTM_ID to another container, or to an empty value to switch it off. */
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? 'GTM-PLSFL8ZJ';
const KEY = 'sc-analytics-consent';
const EVENT = 'sc-analytics-consent-change';

type Choice = 'granted' | 'denied' | null;

/** Pages that carry personal or private details in the address (order links prove ownership) never load the tag manager. */
const PRIVATE = /^\/(admin|auth|account|orders|checkout|track|saved|bag|api|ingest|monitoring)(\/|$)|^\/help\/report/;

function read(): Choice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
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

function choose(value: Exclude<Choice, null>) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked: the choice only lasts until the page is closed.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Forgets the choice, so the question is asked again (the footer link). */
export function resetAnalyticsChoice() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored to forget.
  }
  window.dispatchEvent(new Event(EVENT));
}

// The tag manager, started the way Google documents it, but with Consent Mode: everything is denied until the visitor accepts, and
// advertising storage stays denied even then. It is only ever rendered after "Accept" and never on a private page.
const loader = (id: string) => `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
gtag('consent', 'update', { analytics_storage: 'granted' });
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;

/** Asks once whether visit statistics may be collected; loads Google Tag Manager only after a yes, and only on public pages. */
export function AnalyticsConsent() {
  const pathname = usePathname();
  const choice = useSyncExternalStore(subscribe, read, () => 'denied' as Choice);
  const isPrivate = PRIVATE.test(pathname);

  // Leaving a private page after the tag manager was loaded earlier is not blocked by us: the tag manager's own settings must not
  // track history changes (see docs/SENTRY_POSTHOG.md). Nothing is loaded on a private page that was opened directly.
  useEffect(() => {
    if (choice === 'granted' && isPrivate) {
      (window as unknown as { dataLayer?: unknown[] }).dataLayer?.push({ event: 'sc_private_page' });
    }
  }, [choice, isPrivate]);

  if (!GTM_ID || !/^GTM-[A-Z0-9]+$/.test(GTM_ID)) return null;
  return (
    <>
      {choice === 'granted' && !isPrivate && <Script id="gtm" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: loader(GTM_ID) }} />}
      {choice === null && !isPrivate && (
        <div role="region" aria-label="Visit statistics" className={styles.banner}>
          <p>
            May we use Google Tag Manager to count visits and see which pages are useful? It is off until you say yes, never runs on your account, bag, checkout or
            order pages, and you can change your mind in the footer. <a href="/privacy#analytics">Privacy notice</a>
          </p>
          <div className={styles.buttons}>
            <button type="button" className={styles.secondary} onClick={() => choose('denied')}>
              No thanks
            </button>
            <button type="button" className={styles.primary} onClick={() => choose('granted')}>
              Accept
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** The footer link that reopens the question. Shown only when a tag manager is set up. */
export function AnalyticsChoicesButton() {
  if (!GTM_ID) return null;
  return (
    <button type="button" className={styles.link} onClick={resetAnalyticsChoice}>
      Visit statistics choices
    </button>
  );
}
