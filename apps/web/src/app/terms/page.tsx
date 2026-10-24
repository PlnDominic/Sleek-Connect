import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/LegalPage';
import { getStoreInfo } from '@/lib/catalog';
import { businessDetails, legalUpdated } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms for shopping at Sleek Connect Store: orders, payment, delivery, returns and your account.',
  alternates: { canonical: '/terms' },
};

export default async function TermsPage() {
  const store = await getStoreInfo();
  const days = store.returnWindowDays;
  const business = businessDetails();
  const sections: LegalSection[] = [
    {
      id: 'who',
      title: 'Who we are',
      body: (
        <>
          <p>
            Sleek Connect Store (“we”, “us”) sells beauty, baby and kids’, home and grocery, and fashion and accessory products to customers in Accra, Ghana, through
            this website.
            {business.name && (
              <>
                {' '}
                We are {business.name}
                {business.registrationNumber ? `, registered in Ghana under number ${business.registrationNumber}` : ''}
                {business.address ? `, with our address at ${business.address}` : ''}.
              </>
            )}
          </p>
          <p>By placing an order or creating an account you agree to these terms. If you don’t agree, please don’t use the store.</p>
        </>
      ),
    },
    {
      id: 'eligibility',
      title: 'Who can use the store',
      body: (
        <p>
          You must be 18 or older to create an account or place an order. Many of our products are for children; they are
          meant to be bought and used by an adult. You must give accurate details when you order, including a phone number we
          can reach on the day of delivery.
        </p>
      ),
    },
    {
      id: 'account',
      title: 'Your account',
      body: (
        <>
          <p>
            You don’t need an account to buy. If you sign in (with Google), we keep your bag, saved addresses, saved items and
            order history together. You are responsible for what happens under your account, so keep your Google account
            secure and tell us if you think someone else has used it.
          </p>
          <p>
            You can download your data or delete your account at any time from <Link href="/account/privacy">Privacy and your
            data</Link>.
          </p>
        </>
      ),
    },
    {
      id: 'products',
      title: 'Products and prices',
      body: (
        <>
          <p>
            We sell genuine products from authorised sources, and describe them as accurately as we can, including
            ingredients, regulatory information, batch and expiry where we have them. Colours on screen may differ slightly
            from the real product.
          </p>
          <p>
            Prices are in Ghana cedis (GH₵) and are the prices shown when you place your order. We check every price again
            when the order is placed, so a price shown in your bag can change before then if we update it. If we find a price
            was shown wrongly, we will contact you before dispatching and you may cancel for a full refund.
          </p>
          <p>Some products carry safety warnings or age guidance. Please read them and follow them, especially for young children.</p>
        </>
      ),
    },
    {
      id: 'orders',
      title: 'Placing an order',
      body: (
        <>
          <p>
            Placing an order is an offer to buy. We accept it when payment is confirmed; you will get a message with your
            order number and a link to your order page. We reserve the stock while you pay, and release it if the payment is
            not completed in time.
          </p>
          <p>
            We may refuse or cancel an order if an item is out of stock, an address is outside our delivery areas, we can’t
            confirm your payment, or we suspect misuse. If we cancel after you have paid, you get a full refund.
          </p>
        </>
      ),
    },
    {
      id: 'payment',
      title: 'Payment',
      body: (
        <p>
          You can pay with Mobile Money (MTN MoMo, Telecel Cash or AirtelTigo Money). You approve the payment on your own phone
          with your own PIN; we never see or store your PIN. Card payments will be added later. If you save a Mobile Money
          number to your account we store only the network and the number, so you can choose it at checkout. Payments are
          processed by our payment provider{business.paymentProvider ? `, ${business.paymentProvider}` : ''}.
        </p>
      ),
    },
    {
      id: 'delivery',
      title: 'Delivery',
      body: (
        <>
          <p>
            We deliver within the areas of Accra listed at checkout, for the fee and in the time shown there. Delivery times
            are estimates, not guarantees. Our rider will phone you; you may be asked for a 4-digit delivery code from your
            order page, which helps make sure the parcel reaches the right person.
          </p>
          <p>
            If we can’t deliver because nobody is reachable or the address is wrong, we will try again up to the number of
            attempts shown in the help centre. After that the order may be cancelled and refunded, less any delivery fee
            already incurred.
          </p>
          <p>
            Ownership and risk pass to you when the parcel is handed over to you or someone you have named to receive it.
          </p>
        </>
      ),
    },
    {
      id: 'returns',
      title: 'Returns and refunds',
      body: (
        <>
          <p>
            You can ask to return an eligible item within {days} days of delivery, from your order page. Products that were
            opened or used, such as cosmetics, can only be returned if they arrive damaged, wrong or expired, because we
            can’t resell them safely. Each product page says whether it can be returned.
          </p>
          <p>
            We check returned items, and if the return is approved we refund the price of the items to the way you paid. We
            may ask for photos to show a problem. You can cancel an order yourself until packing starts, from your order page,
            and we refund anything you paid. Nothing in these terms limits your rights under Ghanaian consumer law.
          </p>
        </>
      ),
    },
    {
      id: 'reviews',
      title: 'Reviews',
      body: (
        <p>
          Customers who received a product can review it. Reviews are checked before they appear; we may refuse or remove a
          review that is abusive, off topic, false, or shares personal details. You keep the rights to what you write, and give
          us permission to show it on the store. We show your first name and the first letter of your last name.
        </p>
      ),
    },
    {
      id: 'conduct',
      title: 'Using the store properly',
      body: (
        <ul>
          <li>Don’t use the store to break the law, to place orders with someone else’s payment details, or to resell our content.</li>
          <li>Don’t try to interfere with the website, scrape it at scale, or look for ways around its security.</li>
          <li>Don’t post anything harmful, abusive or misleading in reviews or messages to us.</li>
        </ul>
      ),
    },
    {
      id: 'liability',
      title: 'Our responsibility',
      body: (
        <>
          <p>
            We are responsible for products that are not as described, are faulty, or are unsafe. We are not responsible for
            losses we could not reasonably have predicted, for delays caused by events outside our control (for example
            floods, strikes or network failures), or for the way a product is used against its instructions.
          </p>
          <p>Nothing in these terms excludes liability that can’t be excluded by law, including for death or personal injury caused by our negligence, or for fraud.</p>
        </>
      ),
    },
    {
      id: 'privacy',
      title: 'Your personal data',
      body: (
        <p>
          How we collect and use your data is explained in our <Link href="/privacy">Privacy notice</Link>, which is part of
          these terms.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes and law',
      body: (
        <>
          <p>
            We may change these terms. The date at the top shows when they last changed; orders you place are covered by the
            terms in force when you placed them. If a change is significant we will say so on the store.
          </p>
          <p>
            These terms are governed by the laws of Ghana, and the courts of Ghana can hear any dispute, without affecting any
            right you have to bring a complaint to a consumer or data protection authority.
          </p>
        </>
      ),
    },
    {
      id: 'contact',
      title: 'Contact us',
      body: (
        <p>
          Questions about these terms or an order? Visit the <Link href="/help#contact">help centre</Link>
          {store.supportEmail ? <>, email {store.supportEmail}</> : null}
          {store.supportPhone ? <>, or call {store.supportPhone}</> : null}.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Terms of service"
      updated={legalUpdated}
      intro="The rules for shopping at Sleek Connect Store, in plain language. Please read them before you order."
      sections={sections}
    />
  );
}
