import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/LegalPage';
import { legalUpdated } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Cookie policy',
  description: 'The cookies and on-device storage Sleek Connect Store uses, what each is for, and how to change or clear them.',
  alternates: { canonical: '/cookies' },
};

const sections: LegalSection[] = [
  {
    id: 'summary',
    title: 'The short version',
    body: (
      <p>
        We use only the cookies and storage the store needs to work, plus visit statistics that need no cookie. We use no advertising or
        cross-site tracking cookies. One optional extra, Google Tag Manager, is off until you press Accept. The details are below, and the
        full privacy picture is in our <Link href="/privacy">privacy notice</Link>.
      </p>
    ),
  },
  {
    id: 'necessary',
    title: 'What the store needs to work',
    body: (
      <>
        <p>These are always used, because the store would not work without them. They are not used to track you.</p>
        <ul>
          <li>
            <strong>Sign-in session (a cookie).</strong> Set only if you sign in. It keeps you signed in and proves who you are to the store.
            Its name starts with “sb-”. It is removed when you sign out, or when it expires.
          </li>
          <li>
            <strong>Where to go after signing in (this tab only).</strong> While you are away at Google, your browser remembers the page you
            came from, so you land back on it. It is cleared as soon as you return.
          </li>
          <li>
            <strong>Things you do on this device (device storage).</strong> Your bag, saved items, products you compared or viewed recently,
            recent searches, and the orders you placed on this device, so they are still there when you come back.
          </li>
          <li>
            <strong>Your choices (device storage).</strong> Light, dark or automatic appearance, and your answer about visit statistics.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'statistics',
    title: 'Visit statistics and error reports (no cookies)',
    body: (
      <p>
        To see which pages are used and to fix faults, we use PostHog and Sentry. Both work without cookies and without any identifier
        stored on your device, so they cannot follow you from one visit to the next. They never receive your name, phone number, email
        address, order links, delivery code or payment details, and nothing is collected from the admin console.
      </p>
    ),
  },
  {
    id: 'optional',
    title: 'Optional: Google Tag Manager',
    body: (
      <p>
        If you press Accept when we ask, we load Google Tag Manager on the public pages of the store, to count visits and see which pages are
        useful. It is off until you accept, never runs on your account, bag, checkout, order or sign-in pages, and advertising storage stays
        off. Google may place its own cookies when it runs, under <a href="https://policies.google.com/technologies/cookies" rel="noreferrer noopener">Google’s cookie notice</a>.
        If you press Decline, nothing from Google is loaded.
      </p>
    ),
  },
  {
    id: 'payment',
    title: 'Our payment provider',
    body: (
      <p>
        When you pay online you are taken to our payment provider’s own page. That page may set its own cookies, under its own notice. We never
        see your card details or your Mobile Money PIN.
      </p>
    ),
  },
  {
    id: 'choices',
    title: 'Changing or clearing your choices',
    body: (
      <>
        <p>
          You can change your mind about visit statistics at any time with “Visit statistics choices” at the bottom of any page, which asks
          again. To remove everything stored on your device, clear this site’s data in your browser settings, or sign out to remove the
          sign-in cookie. Clearing it empties your bag and saved items on this device, and signed-in shoppers get theirs back from their
          account when they sign in again.
        </p>
        <p>
          Questions? Reach us through the <Link href="/help#contact">help centre</Link>.
        </p>
      </>
    ),
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie policy"
      intro="What we store in your browser, why, and how to change it."
      updated={legalUpdated}
      sections={sections}
    />
  );
}
