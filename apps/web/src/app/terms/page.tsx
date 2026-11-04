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
          You must be 18 or older to create an account or place an order, and we ask you to confirm it when you create an account
          or check out as a guest. Many of our products are for children; they are meant to be bought and used by an adult. You
          must give accurate details when you order, including a phone number we can reach on the day of delivery.
        </p>
      ),
    },
    {
      id: 'account',
      title: 'Your account',
      body: (
        <>
          <p>
            You don’t need an account to buy. If you sign in (with your phone or Google), we keep your bag, saved addresses, saved items and
            order history together. You are responsible for what happens under your account, so keep your phone and sign-in
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
            We, and the independent stores that sell through us (see “Independent stores”), sell genuine products from authorised
            sources, and describe them as accurately as we can, including
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
            Placing an order is an offer to buy. We accept it when payment is confirmed or, for pay on delivery, when we have
            confirmed the order with you; you will get a message with your order number and a link to your order page. We reserve
            the stock while you pay (a few minutes for an online payment) or while we confirm a pay on delivery order (for a
            limited time, usually a day), and release it if the payment or the confirmation does not happen in time.
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
          You can pay online with Mobile Money (MTN MoMo, Telecel Cash or AT Money) or a Visa or Mastercard card, or choose pay
          on delivery. Online payments are made on the secure page of our payment provider
          {business.paymentProvider ? `, ${business.paymentProvider}` : ''}: you approve a Mobile Money payment with your own PIN
          or enter your card there, so we never see or store your PIN or card details. If you save a Mobile Money number to your
          account we store only the network and the number, so you can choose it at checkout.
        </p>
      ),
    },
    {
      id: 'cash',
      title: 'Pay on delivery',
      body: (
        <>
          <p>
            With pay on delivery you pay the rider in cash when your order arrives; we do not accept bank transfers. We call you
            to confirm the order before we pack it, and an order we cannot confirm in time is cancelled and its stock released.
            Please have the full amount ready; the rider cannot complete the delivery until it is paid. The option may be limited to
            orders up to a maximum amount, may be switched off, and is not offered for items from independent stores, which are paid
            for online.
          </p>
          <p>
            If you repeatedly refuse or can’t be reached for pay on delivery orders, we may ask you to pay online in future. If you
            paid cash and are later due a refund, we pay it to a Mobile Money number you give us.
          </p>
        </>
      ),
    },
    {
      id: 'suppliers',
      title: 'Where our products come from',
      body: (
        <>
          <p>
            Sleek Connect Store buys its products from suppliers and sells them to you, so you deal only with us: we take your
            payment, deliver your order and handle returns and refunds. We check what we buy for authenticity and expiry before it is
            sold. Our suppliers never receive your name, phone number, address or delivery code.
          </p>
        </>
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
            may ask for photos to show a problem. If you paid cash on delivery, we pay the refund to a Mobile Money number you give
            us. You can cancel an order yourself until packing starts, from your order page,
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
          <li>Don’t place orders you don’t intend to accept, or give a false name, phone number or address.</li>
        </ul>
      ),
    },
    {
      id: 'liability',
      title: 'Our responsibility',
      body: (
        <>
          <p>
            We are responsible for products that are not as described, are faulty, or are unsafe, including those sold by independent
            stores through us. We are not responsible for
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
