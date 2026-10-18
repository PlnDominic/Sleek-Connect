import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { getStaffSession, roleLabels } from '@/lib/admin/session';
import { Icon } from '@/components/Icon';
import { AdminNav } from './AdminNav';
import { SignInWithGoogle, SignOutButton } from './SessionButtons';
import { SignInShell } from './SignInShell';
import styles from './admin.module.css';
import signIn from './signin.module.css';

/** Staff must be signed in with Google and be on the staff list (PRD FR-107). */
export async function AdminGate({ children }: { children: ReactNode }) {
  const session = await getStaffSession();

  if (session.state === 'signed_out') {
    return (
      <SignInShell>
        <span className={signIn.badge}>
          <Icon name="lockKeyhole" size={24} strokeWidth={1.7} />
        </span>
        <h1>Welcome back</h1>
        <p className={signIn.lead}>Sign in with the Google account your admin added to the staff list.</p>
        <SignInWithGoogle />
        <p className={signIn.divider}>Staff accounts only</p>
        <p className={signIn.note}>
          <Icon name="shieldCheck" size={18} strokeWidth={1.8} />
          <span>
            Access is limited to people on the staff list. Google handles your password, so we never see it.
          </span>
        </p>
      </SignInShell>
    );
  }

  if (session.state === 'not_staff') {
    const initial = (session.name ?? session.email ?? '?').trim().charAt(0).toUpperCase();
    return (
      <SignInShell>
        <span className={signIn.badge}>
          <Icon name="lock" size={24} strokeWidth={1.7} />
        </span>
        <h1>No staff access</h1>
        <div className={signIn.person}>
          <span className={signIn.avatar} aria-hidden="true">
            {session.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- the shopper's Google profile photo
              <img src={session.avatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              initial
            )}
          </span>
          <span className={signIn.personText}>
            {session.name && <strong>{session.name}</strong>}
            <span>{session.email}</span>
          </span>
        </div>
        <p className={signIn.lead}>
          This Google account isn’t on the staff list yet. Ask an admin to add it, then sign in again, or use a
          different account.
        </p>
        <SignInWithGoogle label="Use a different Google account" chooseAccount />
        <SignOutButton />
      </SignInShell>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarInner}>
          <Link href="/admin" className={styles.brand}>
            <Logo size={18} onDark />
            <span className={styles.brandLabel}>Admin</span>
          </Link>
          <AdminNav role={session.role} />
          <div className={styles.who}>
            <span>{session.email}</span>
            <span className={styles.roleTag}>{roleLabels[session.role]}</span>
            <SignOutButton compact />
          </div>
        </div>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
