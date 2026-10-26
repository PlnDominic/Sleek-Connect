import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { getStaffSession, roleLabels } from '@/lib/admin/session';
import { Icon } from '@/components/Icon';
import { AdminNav } from './AdminNav';
import { PasswordSignIn, SignInWithGoogle, SignOutButton } from './SessionButtons';
import { SignInShell } from './SignInShell';
import styles from './admin.module.css';
import signIn from './signin.module.css';

/** Staff must be signed in (Google, or email and password) and be on the staff list (PRD FR-107). */
export async function AdminGate({ children }: { children: ReactNode }) {
  const session = await getStaffSession();

  if (session.state === 'signed_out') {
    return (
      <SignInShell>
        <h1>Welcome back</h1>
        <p className={signIn.lead}>Sign in to manage orders, stock and customers.</p>
        <SignInWithGoogle />
        <p className={signIn.divider}>or use your email</p>
        <PasswordSignIn />
        <p className={signIn.note}>
          <Icon name="shieldCheck" size={18} strokeWidth={1.8} />
          <span>Only people on the staff list can get in, however they sign in.</span>
        </p>
      </SignInShell>
    );
  }

  if (session.state === 'not_staff') {
    const initial = (session.name ?? session.email ?? '?').trim().charAt(0).toUpperCase();
    return (
      <SignInShell>
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
          This account isn’t on the staff list yet. Ask an admin to add it, then sign in again, or use a different
          account.
        </p>
        <SignInWithGoogle label="Use a different Google account" chooseAccount />
        <SignOutButton />
      </SignInShell>
    );
  }

  const displayName = session.name ?? session.email?.split('@')[0] ?? 'Staff';
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarInner}>
          <div className={styles.brand}>
            <Link href="/admin" aria-label="Sleek Connect Store admin" style={{ textDecoration: 'none' }}>
              <Logo size={19} onDark />
            </Link>
            <span className={styles.brandLabel}>Admin</span>
          </div>
          <AdminNav role={session.role} />
          <div className={styles.account}>
            <Link href="/" className={styles.storeLink}>
              View store
            </Link>
            <div className={styles.user}>
              <span className={styles.userAvatar} aria-hidden="true">
                {session.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the staff member's Google profile photo
                  <img src={session.avatar} alt="" referrerPolicy="no-referrer" />
                ) : (
                  initial
                )}
              </span>
              <span className={styles.userText}>
                <strong>{displayName}</strong>
                <span>{session.email}</span>
              </span>
            </div>
            <div className={styles.userFoot}>
              <span className={styles.roleTag}>{roleLabels[session.role]}</span>
              <SignOutButton compact />
            </div>
          </div>
        </div>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
