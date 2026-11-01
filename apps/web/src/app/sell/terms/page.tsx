import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { LegalPage, type LegalSection } from '@/components/LegalPage';
import { getVendorTerms } from '@/lib/catalog';
import { prohibitedProducts, vendorTermsUpdated } from '@/lib/vendor-terms';

export const metadata: Metadata = {
  title: 'Seller terms',
  description: 'The terms for selling on Sleek Connect Store: fees, prices, orders, payouts, returns, disputes and what you may not sell.',
  alternates: { canonical: '/sell/terms' },
};

export default async function SellerTermsPage() {
  const terms = await getVendorTerms();
  const sections: LegalSection[] = [
    {
      id: 'who',
      title: 'Who can sell',
      body: (
        <p>
          You must be 18 or older, and either the owner of the business or authorised to act for its owner. You give us your real
          name, a valid ID, a phone number and email we can reach you on, and your tax details (see “Payouts and tax”). One account
          opens one store. You must keep these details up to date.
        </p>
      ),
    },
    {
      id: 'fee',
      title: 'The yearly fee',
      body: (
        <p>
          Your store opens when we have approved it and you have paid the yearly fee, currently {formatPrice(terms.annualFee)}. It runs
          for a year; if it lapses your store and products come off the site after {terms.graceDays} grace days until you pay again. The
          fee is not refunded if we suspend or close your store for breaking these terms.
        </p>
      ),
    },
    {
      id: 'prices',
      title: 'Prices and what you earn',
      body: (
        <>
          <p>
            You set your price for each product. We add a markup to get the price shoppers pay. You earn <strong>your own price</strong>{' '}
            for each item delivered; the markup is ours. We tell you the markup when we approve a product, and may change it for new
            or changed products. You can’t see or change the shopper’s price.
          </p>
          <p>We approve every product before it appears, and again when you change what it is (its name, description, ingredients and so on).</p>
        </>
      ),
    },
    {
      id: 'orders',
      title: 'Orders',
      body: (
        <>
          <p>
            When a shopper has paid, you see the items to pack, never the shopper’s name, phone number, address or delivery code. Pack
            each order within one working day, mark it packed, and hand it to our team when we collect it. We deliver it. Pack exactly
            what was ordered, in sealed, undamaged packaging, with the batch and expiry as listed.
          </p>
          <p>
            Keep your stock numbers accurate. If you can’t supply something that was ordered, tell us at once so we can cancel and
            refund the shopper. Repeated cancellations for stock you didn’t have may lead to suspension.
          </p>
        </>
      ),
    },
    {
      id: 'payouts',
      title: 'Payouts and tax',
      body: (
        <>
          <p>
            You earn your price on an order once it is delivered. We pay what is payable to the Mobile Money account saved in your
            store, normally once a week (on Fridays), after a hold of {terms.payoutHoldDays} days from delivery so that returns can still
            be asked for. The smallest payout is {formatPrice(terms.minPayout)}, unless it clears everything payable. You can see
            what you are owed, and what is on hold, under Earnings.
          </p>
          <p>
            Money comes off what you are owed when a return is received (at your price) and when a dispute is decided against you
            (see “Returns and disputes”). If that takes your balance below zero it is taken from future earnings.
          </p>
          <p>
            You are responsible for your own taxes. We need your tax identification number (TIN) and legal name before we can pay you,
            and we may report what we pay you to the tax authority.
          </p>
        </>
      ),
    },
    {
      id: 'returns',
      title: 'Returns and disputes',
      body: (
        <>
          <p>
            Shoppers can return eligible items within the store’s return window. When we receive an approved return, its value at your
            price comes off your earnings, and the item goes back into your stock if it can be resold.
          </p>
          <p>
            If a shopper reports that an item was counterfeit, damaged, not as described or the wrong one, we open a case. You will be
            told, and have <strong>48 hours</strong> to reply with what you know. We then decide, and we may charge you up to your
            share of that item. Our decision is final inside the marketplace. A case upheld for a <strong>counterfeit</strong> item
            removes the product; a <strong>second</strong> upheld counterfeit case closes your store.
          </p>
        </>
      ),
    },
    {
      id: 'prohibited',
      title: 'What you may not sell',
      body: (
        <>
          <ul>
            {prohibitedProducts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Products must also meet our <Link href="/sell/standards">product standards</Link> (photos, descriptions, claims, ingredients,
            expiry, authenticity, registration and safety).
          </p>
        </>
      ),
    },
    {
      id: 'conduct',
      title: 'Your conduct',
      body: (
        <ul>
          <li>Don’t contact shoppers outside the store, ask for payment outside the store, or use their details for any other purpose.</li>
          <li>Don’t post fake reviews of your own products or other stores.</li>
          <li>Don’t put anything harmful or misleading in your store page, products or messages to us.</li>
          <li>Reply to our messages within {terms.replyHours} hours on working days, and we will do the same for yours.</li>
        </ul>
      ),
    },
    {
      id: 'suspension',
      title: 'Suspending and ending',
      body: (
        <p>
          We may remove a product, suspend your store or end it if you break these terms, sell something prohibited, put shoppers at
          risk, or we can’t verify your details. We tell you why. You can close your store at any time by telling us; orders already
          placed must still be fulfilled and what you are owed is paid out in the normal way. What you owe us, and our right to hold
          earnings for open disputes, continues after your store closes.
        </p>
      ),
    },
    {
      id: 'responsibility',
      title: 'Your products and our responsibility',
      body: (
        <p>
          You are responsible for your products being genuine, lawful, safe and as described, and for having any registration or licence
          they need. We are responsible for running the marketplace as described in these terms. Nothing here excludes liability that
          can’t be excluded by law.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes and law',
      body: (
        <p>
          We may change these terms. We will tell you, and ask you to accept the new version in your dashboard before you list or edit
          products. These terms are governed by the laws of Ghana. Questions? <Link href="/help#contact">Contact us</Link>.
        </p>
      ),
    },
  ];
  return (
    <LegalPage
      title="Seller terms"
      updated={vendorTermsUpdated}
      intro="What you agree to when you sell on Sleek Connect Store, in plain language. Please read it before you apply."
      sections={sections}
    />
  );
}
