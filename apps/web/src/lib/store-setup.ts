/**
 * The "Set up your store" checklist, like Etsy's shop setup: what a vendor still has to do before and after their store opens.
 * Pure, so it can be tested and shown anywhere.
 */

export interface StoreSetupInput {
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  live: boolean;
  hasLogo: boolean;
  hasBanner: boolean;
  tagline: string | null;
  description: string | null;
  returnsPolicy: string | null;
  payoutAccountSet: boolean;
  tinSet: boolean;
  termsCurrent: boolean;
  /** Products the vendor has added (drafts count). */
  productCount: number;
}

export interface SetupStep {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  href: string;
  /** Why it can't be done yet, when it can't. */
  locked?: string;
}

export interface StoreSetup {
  steps: SetupStep[];
  done: number;
  total: number;
  percent: number;
  /** The first step the vendor can do now (approval is up to us, so it is never the next step). */
  next: SetupStep | null;
}

const long = (text: string | null, min: number) => (text?.trim().length ?? 0) >= min;

export function storeSetup(i: StoreSetupInput): StoreSetup {
  const approved = i.status === 'active';
  const steps: SetupStep[] = [
    { id: 'apply', title: 'Send your application', hint: 'Your name, ID and phone number.', done: true, href: '/vendor' },
    {
      id: 'approval',
      title: 'Get approved by our team',
      hint: 'We check your ID and call you. This usually takes a day or two.',
      done: approved,
      href: '/vendor',
    },
    { id: 'tagline', title: 'Write a one-line description', hint: 'A short sentence under your store name, for example “Pure shea butter from Tamale”.', done: long(i.tagline, 10), href: '/vendor/store' },
    { id: 'logo', title: 'Add your logo', hint: 'A square picture shoppers see next to your name.', done: i.hasLogo, href: '/vendor/store' },
    { id: 'banner', title: 'Add a banner', hint: 'A wide picture across the top of your store page.', done: i.hasBanner, href: '/vendor/store' },
    { id: 'story', title: 'Tell your story', hint: 'Who you are and what makes your products special. At least a few sentences.', done: long(i.description, 80), href: '/vendor/store' },
    { id: 'policies', title: 'Set your returns policy', hint: 'What happens if a shopper isn’t happy. Short and clear builds trust.', done: long(i.returnsPolicy, 20), href: '/vendor/store' },
    {
      id: 'product',
      title: 'Add your first product',
      hint: 'Photos, price and details. We review it before it goes on sale.',
      done: i.productCount > 0,
      href: '/vendor/products/new',
      locked: approved ? undefined : 'Available once you are approved.',
    },
    { id: 'payout', title: 'Choose how you get paid', hint: 'The Mobile Money number we pay your earnings to.', done: i.payoutAccountSet, href: '/vendor/earnings', locked: approved ? undefined : 'Available once you are approved.' },
    { id: 'tax', title: 'Add your tax details', hint: 'Your legal name and tax number. We need them before the first payout.', done: i.tinSet, href: '/vendor/earnings', locked: approved ? undefined : 'Available once you are approved.' },
    {
      id: 'terms',
      title: 'Accept the seller terms',
      hint: 'Read and accept the current terms.',
      done: i.termsCurrent,
      href: '/vendor/help',
      locked: approved ? undefined : 'Available once you are approved.',
    },
    {
      id: 'open',
      title: 'Pay the yearly fee and open your store',
      hint: 'Your store and approved products go on sale as soon as the fee is paid.',
      done: i.live,
      href: '/vendor',
      locked: approved ? undefined : 'Available once you are approved.',
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return {
    steps,
    done,
    total: steps.length,
    percent: Math.round((done * 100) / steps.length),
    next: steps.find((s) => !s.done && !s.locked && s.id !== 'approval') ?? null,
  };
}
