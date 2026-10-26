import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { city, formatPrice, momoNetworks } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getDeliveryConfig, getStoreInfo, type StoreInfo } from '@/lib/catalog';
import { estimate, type DeliveryConfig } from '@/lib/delivery';
import { telHref, whatsappHref } from '@/lib/contact';
import styles from './help.module.css';

export const metadata: Metadata = {
  title: 'Help centre',
  description: 'Answers about ordering, payment, delivery, returns and product safety, and how to reach Sleek Connect Store.',
};

const topics = [
  { id: 'ordering', label: 'Ordering' },
  { id: 'payment', label: 'Payment' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'returns', label: 'Returns and refunds' },
  { id: 'authenticity', label: 'Authenticity' },
  { id: 'safety', label: 'Product safety' },
  { id: 'account', label: 'Your account' },
  { id: 'contact', label: 'Contact us' },
];

export default async function HelpPage() {
  const [store, delivery] = await Promise.all([getStoreInfo(), getDeliveryConfig()]);
  const zoneName = new Map(delivery.zones.map((z) => [z.id, z.name]));
  const days = store.returnWindowDays;

  return (
    <>
      <SiteHeader current="Contact" />
      <main className={styles.page}>
        <div className={styles.hero}>
          <div className="container">
            <p className={styles.kicker}>Help centre</p>
            <h1>How can we help?</h1>
            <p>Quick answers, and every way to reach us.</p>
          </div>
        </div>

        <div className={`container ${styles.layout}`}>
          <nav aria-label="Help topics" className={styles.topics}>
            <strong>Topics</strong>
            {topics.map((t) => (
              <a key={t.id} href={`#${t.id}`}>
                {t.label}
              </a>
            ))}
          </nav>

          <div className={styles.content}>
          <Topic id="ordering" title="Ordering">
            <Faq q="How do I place an order?">
              <p>
                Add products to your bag, then choose Checkout. Enter your delivery details (your area, GhanaPost GPS
                address and directions for the rider) and pay with Mobile Money. You’ll get a confirmation message with a
                link to your order page.
              </p>
            </Faq>
            <Faq q="Can I change or cancel my order?">
              <p>
                <Link href="#contact">Contact us</Link> with your order number as soon as you can. We can cancel an order
                until it leaves with a rider. If you’ve already paid, we refund you in full.
              </p>
            </Faq>
            <Faq q="Can I send an order as a gift?">
              <p>Yes. Tick “This is a gift” at checkout. We wrap it and leave the prices off the packing slip.</p>
            </Faq>
          </Topic>

          <Topic id="payment" title="Payment">
            <Faq q="How can I pay?">
              <p>
                Mobile Money: {momoNetworks.map((n) => n.label).join(', ')}. You approve the payment on your phone with
                your PIN. We never see or store your PIN. Card payments (Visa and Mastercard) are coming soon.
              </p>
            </Faq>
            <Faq q="How long do you hold my items while I pay?">
              <p>
                {store.reservationMinutes} minutes. If the payment isn’t approved in that time, the order is cancelled and
                the items go back on sale. You can order again at any time.
              </p>
            </Faq>
            <Faq q="I was charged but my order says it isn’t paid">
              <p>
                Mobile Money confirmations can take a few minutes. Your order page updates by itself. If it still says
                unpaid after 15 minutes, <Link href="/help/report">report a problem</Link> with the order number and the
                transaction ID from your MoMo message.
              </p>
            </Faq>
          </Topic>

          <Topic id="delivery" title="Delivery">
            <Faq q={`Where do you deliver in ${city}?`} open>
              <p>We deliver to these areas:</p>
              <ul>
                {delivery.areas.map((a) => (
                  <li key={a.name}>
                    {a.name}
                    {a.zoneId && zoneName.has(a.zoneId) ? ` (${zoneName.get(a.zoneId)})` : ''}
                  </li>
                ))}
              </ul>
            </Faq>
            <Faq q="How much is delivery, and how long does it take?">
              <ul>
                {delivery.options.map((o) => (
                  <li key={o.id}>
                    <strong>{o.label}</strong>: {estimate(o)}. <DeliveryFees option={o.id} delivery={delivery} />
                  </li>
                ))}
              </ul>
              {delivery.freeThreshold !== null && (
                <p>
                  {delivery.options
                    .filter((o) => o.freeEligible)
                    .map((o) => o.label)
                    .join(' and ') || 'Delivery'}{' '}
                  is free on orders of {formatPrice(delivery.freeThreshold)} or more.
                </p>
              )}
              <p>The fee for your order is shown at checkout before you pay.</p>
            </Faq>
            <Faq q="How do I track my order?">
              <p>
                Use the link in your confirmation message, or <Link href="/track">track it</Link> with your order number
                and phone number. We text you when your order is confirmed, packed and on its way.
              </p>
            </Faq>
            <Faq q="What is the delivery code?">
              <p>
                Your order page and the “on the way” message show a delivery code. Give it to the rider only once you have
                your parcel. It’s how we know the order reached you.
              </p>
            </Faq>
          </Topic>

          <Topic id="returns" title="Returns and refunds">
            <Faq q="How do I return something?" open>
              <p>
                Open your order page and choose <strong>Request a return</strong> within {days} days of delivery. Pick the
                items, tell us why and add up to 3 photos. You’ll get a return number (it starts with RT-) and we’ll text
                you at each step.
              </p>
            </Faq>
            <Faq q="What can I return?">
              <ul>
                <li>Unopened, sealed items, within {days} days of delivery.</li>
                <li>
                  Some items can’t be returned once opened, such as lipsticks and opened skincare. Their product page says
                  so. You can still return them if they arrive damaged, wrong or expired.
                </li>
                <li>Anything that isn’t genuine, at any time: you get a full refund.</li>
              </ul>
            </Faq>
            <Faq q="How do refunds work?">
              <p>
                Once we’ve approved the return and checked the item, we refund the price of the returned items to the
                Mobile Money wallet or card you paid with.
              </p>
            </Faq>
          </Topic>

          <Topic id="authenticity" title="Authenticity promise">
            <Faq q="Are your products genuine?">
              <p>
                Yes. We buy only from brands and their authorised distributors. Beauty and bath products show their Ghana
                FDA registration number. If anything you buy from us isn’t genuine, we refund you in full.
              </p>
            </Faq>
            <Faq q="How can I check the batch and expiry date?">
              <p>
                Product pages show the batch and expiry date you’ll receive. Once your order is packed, your order page
                lists the exact batches packed for you.
              </p>
            </Faq>
          </Topic>

          <Topic id="safety" title="Product safety">
            <Faq q="How do you keep baby and kids’ products safe?">
              <p>
                Every kids’ product lists its recommended age, and you can <Link href="/shop-by-age">shop by age</Link>.
                Important warnings, such as small parts, appear above “Add to bag” and in your bag.
              </p>
            </Faq>
            <Faq q="What happens if a product is recalled?">
              <p>
                We take the product off sale straight away and hold back the stock we have. If you have a recalled
                product, stop using it and <Link href="/help/report">contact us</Link>: we’ll tell you what to do next.
              </p>
            </Faq>
          </Topic>

          <Topic id="account" title="Your account">
            <Faq q="Do I need an account?">
              <p>
                No. You can check out as a guest. Signing in with Google saves your bag across devices and lists your
                orders under <Link href="/account/orders">My orders</Link>.
              </p>
            </Faq>
          </Topic>

          <Contact store={store} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** "GH₵ 20 (Outer Accra: GH₵ 45, not available in Far East)". */
function DeliveryFees({ option, delivery }: { option: string; delivery: DeliveryConfig }) {
  const base = delivery.options.find((o) => o.id === option)?.fee ?? null;
  const show = (fee: number | null) => (fee === null ? 'to be confirmed' : fee === 0 ? 'free' : formatPrice(fee));
  const exceptions = delivery.zones.flatMap((z) => {
    const rate = delivery.rates.find((r) => r.zoneId === z.id && r.optionId === option);
    if (!rate) return [];
    return [rate.available ? `${z.name}: ${show(rate.fee ?? base)}` : `not available in ${z.name}`];
  });
  return (
    <>
      {show(base)}
      {exceptions.length > 0 && ` (${exceptions.join(', ')})`}
    </>
  );
}

function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function Faq({ q, open, children }: { q: string; open?: boolean; children: ReactNode }) {
  return (
    <details className={styles.faq} open={open}>
      <summary>{q}</summary>
      <div>{children}</div>
    </details>
  );
}

function Contact({ store }: { store: StoreInfo }) {
  return (
    <section id="contact" className={styles.section} aria-labelledby="contact-title">
      <h2 id="contact-title">Contact us</h2>
      <p className={styles.muted}>
        {store.supportHours ? `Open ${store.supportHours}. ` : ''}Have your order number ready if your message is about an order.
      </p>
      <div className={styles.contactGrid}>
        <ContactCard
          icon="call"
          title="Call us"
          value={store.supportPhone}
          href={store.supportPhone && telHref(store.supportPhone)}
        />
        <ContactCard
          icon="chat"
          title="WhatsApp"
          value={store.supportWhatsapp}
          href={store.supportWhatsapp && whatsappHref(store.supportWhatsapp, 'Hello Sleek Connect Store, ')}
        />
        <ContactCard
          icon="mail"
          title="Email"
          value={store.supportEmail}
          href={store.supportEmail && `mailto:${store.supportEmail}`}
        />
        <Link href="/help/report" className={styles.contactCard}>
          <Icon name="headset" size={24} />
          <strong>Report a problem</strong>
          <span>Send us a message about an order. You’ll get a case number.</span>
        </Link>
      </div>
    </section>
  );
}

function ContactCard({
  icon,
  title,
  value,
  href,
}: {
  icon: 'call' | 'chat' | 'mail';
  title: string;
  value?: string;
  href?: string;
}) {
  if (!value) return null;
  const body = (
    <>
      <Icon name={icon} size={24} />
      <strong>{title}</strong>
      <span>{value}</span>
    </>
  );
  return href ? (
    <a href={href} className={styles.contactCard} target={href.startsWith('https:') ? '_blank' : undefined} rel="noreferrer">
      {body}
    </a>
  ) : (
    <div className={styles.contactCard}>{body}</div>
  );
}
