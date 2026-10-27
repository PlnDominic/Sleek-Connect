import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getVendorSession } from '@/lib/vendor';
import { sendMessage } from '../actions';
import { VendorForm } from '../VendorForm';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Messages' };

interface Message {
  sender: 'vendor' | 'owner';
  body: string;
  created_at: string;
}

const dateText = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });

export default async function VendorMessagesPage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor?.live) redirect('/vendor');
  const { data, error } = await session.supabase.rpc('vendor_messages');
  if (error) throw error;
  const messages = (data as unknown as Message[]) ?? [];
  return (
    <>
      <p className={styles.lead}>Ask us about a product, an order or a payment. We reply here and text you when we do.</p>
      <section className={styles.panel}>
        {messages.length === 0 ? (
          <p className={styles.muted}>No messages yet.</p>
        ) : (
          <div className={styles.thread}>
            {messages.map((m, i) => (
              <p key={i} className={styles.bubble} data-from={m.sender}>
                {m.body}
                <small>
                  {m.sender === 'vendor' ? 'You' : 'Sleek Connect'} · {dateText(m.created_at)}
                </small>
              </p>
            ))}
          </div>
        )}
        <VendorForm action={sendMessage} resetOnSuccess>
          <label className={styles.field}>
            <span>Your message</span>
            <textarea name="body" rows={3} required maxLength={2000} />
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Send
            </button>
          </div>
        </VendorForm>
      </section>
    </>
  );
}
