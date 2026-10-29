import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/LegalPage';
import { getStoreInfo } from '@/lib/catalog';
import { businessDetails, legalUpdated } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy notice',
  description: 'What personal data Sleek Connect Store collects, why, who sees it, how long we keep it and your rights.',
  alternates: { canonical: '/privacy' },
};

export default async function PrivacyPage() {
  const store = await getStoreInfo();
  const business = businessDetails();
  const sections: LegalSection[] = [
    {
      id: 'who',
      title: 'Who is responsible for your data',
      body: (
        <>
          <p>
            Sleek Connect Store
            {business.name || business.address
              ? ` (${[business.name, business.address].filter(Boolean).join(', ')})`
              : ''}{' '}
            decides how and why your personal data is used, which makes us the “data controller” under the Data Protection
            Act, 2012 (Act 843) of Ghana.
            {business.dataProtectionNumber
              ? ` We are registered with the Data Protection Commission under number ${business.dataProtectionNumber}.`
              : ''}
          </p>
          <p>
            Contact us about your data through the <Link href="/help#contact">help centre</Link>
            {store.supportEmail ? <>, or at {store.supportEmail}</> : null}.
          </p>
        </>
      ),
    },
    {
      id: 'collect',
      title: 'What we collect',
      body: (
        <ul>
          <li>
            <strong>Your account.</strong> If you sign in with your phone: your phone number. If you sign in with Google: your email
            address, name and profile photo from Google. Either way, we record when you confirmed you are 18 or over and accepted our
            terms. We never see your Google password.
          </li>
          <li>
            <strong>Your orders.</strong> The name, phone number, email address (if you give one), area, GhanaPost GPS address and rider directions you give us for
            delivery; what you bought and paid; the Mobile Money network and number you paid with; and the status history of the order.
          </li>
          <li>
            <strong>What you save.</strong> Your bag, saved items, saved addresses, saved Mobile Money numbers and any reviews you write.
          </li>
          <li>
            <strong>Messages you send us.</strong> Support cases, return requests and any photos you attach to a return.
          </li>
          <li>
            <strong>The mobile app.</strong> Your sign-in is kept on your phone so you stay signed in. If you allow notifications, we
            keep a push token, which identifies your phone to the push service, and the order or account it belongs to, so we can tell
            you when an order is packed, on its way and delivered. You can turn this off in the app at any time.
          </li>
          <li>
            <strong>Technical data.</strong> Standard information your browser sends (such as IP address and device type) and error
            logs, used to run and secure the store. We also keep a short list of your recent searches on your own device.
          </li>
        </ul>
      ),
    },
    {
      id: 'why',
      title: 'Why we use it',
      body: (
        <ul>
          <li><strong>To fulfil your order</strong> (contract): take payment, pack, deliver, and handle returns and refunds.</li>
          <li><strong>To run your account</strong> (contract): keep your bag, addresses and orders across devices.</li>
          <li><strong>To keep you informed</strong> (contract): send order and delivery messages by SMS or email, and reply to support.</li>
          <li><strong>To keep the store safe and lawful</strong> (legitimate interest and legal duty): prevent fraud and misuse, keep accounting records, and answer legal requests.</li>
          <li><strong>To improve the store</strong> (legitimate interest): fix errors and see which products customers value, using reviews and order totals rather than your identity.</li>
        </ul>
      ),
    },
    {
      id: 'share',
      title: 'Who we share it with',
      body: (
        <>
          <p>We don’t sell your data. We share only what is needed, with:</p>
          <ul>
            <li>Our <strong>payment provider</strong>{business.paymentProvider ? ` (${business.paymentProvider})` : ''}, to take your Mobile Money payment and confirm it.</li>
            <li>Our <strong>messaging providers</strong>, to send SMS and email about your order, and Expo&apos;s push service, to deliver app notifications.</li>
            <li><strong>Our riders</strong>, who see your name, phone number, address and directions for the delivery only.</li>
            <li>Our <strong>hosting and database providers</strong> (Supabase and Vercel), who store and serve the data for us under contract.</li>
            <li>Authorities, when the law requires it.</li>
          </ul>
          <p>
            Some of these providers are outside Ghana. Where that is so, we use providers who protect personal data to a
            standard comparable to Ghanaian law.
          </p>
          <p>Our staff see only what their job needs. Staff can’t see your delivery code or the private link to your order.</p>
        </>
      ),
    },
    {
      id: 'keep',
      title: 'How long we keep it',
      body: (
        <ul>
          <li><strong>Account details, saved addresses, numbers, bag, saved items and reviews:</strong> until you delete your account.</li>
          <li>
            <strong>Order records:</strong> we keep them for our accounting, refunds and legal duties. When you delete your
            account we remove your name, phone number, address, directions and Mobile Money number from your orders and keep only
            what was bought, the amounts and the dates.
          </li>
          <li><strong>Support cases and return photos:</strong> removed or scrubbed when you delete your account, and otherwise kept only as long as needed to resolve the case.</li>
          <li><strong>Queued and sent messages:</strong> dropped when you delete your account.</li>
          <li><strong>Push tokens:</strong> removed when you turn notifications off in the app, when the app is removed from your phone, or when you delete your account.</li>
        </ul>
      ),
    },
    {
      id: 'rights',
      title: 'Your rights',
      body: (
        <>
          <p>You have the right to:</p>
          <ul>
            <li>ask what we hold about you, and <strong>download a copy</strong>;</li>
            <li><strong>correct</strong> details that are wrong (you can edit saved addresses and numbers yourself);</li>
            <li><strong>delete</strong> your account and the data tied to it;</li>
            <li>object to, or ask us to limit, some uses of your data; and</li>
            <li>complain to the Data Protection Commission of Ghana if you think we have not handled your data properly.</li>
          </ul>
          <p>
            Signed-in customers can download their data and delete their account any time at{' '}
            <Link href="/account/privacy">Privacy and your data</Link>. For anything else, contact us (see section 1).
          </p>
        </>
      ),
    },
    {
      id: 'security',
      title: 'How we protect it',
      body: (
        <p>
          Data is encrypted in transit, access is limited by role, every staff action on sensitive data is recorded, and your Mobile
          Money PIN and Google password never reach us. No system is perfectly secure; if a breach affects you we will tell you and the
          Data Protection Commission as the law requires.
        </p>
      ),
    },
    {
      id: 'storage',
      title: 'Cookies and storage on your device',
      body: (
        <p>
          We use only what the store needs to work: a sign-in session if you sign in, and storage on your device for your bag, saved
          items and recent searches. We don’t use advertising or cross-site tracking cookies.
        </p>
      ),
    },
    {
      id: 'children',
      title: 'Children',
      body: (
        <p>
          The store is for adults. We sell products for children but don’t knowingly collect personal data from anyone under 18, and
          you shouldn’t give us a child’s details other than a delivery name where needed.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to this notice',
      body: (
        <p>
          When we change this notice we update the date at the top, and tell signed-in customers if the change matters to them.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Privacy notice"
      updated={legalUpdated}
      intro="What we collect about you, why, who sees it, how long we keep it, and what you can do about it."
      sections={sections}
    />
  );
}
