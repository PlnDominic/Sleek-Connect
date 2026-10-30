import Link from 'next/link';
import type { ReactNode } from 'react';
import { getStaffSession, roleLabels } from '@/lib/admin/session';
import { Icon } from '@/components/Icon';
import { AdminNav } from './AdminNav';
import { Shell } from './Shell';
import shell from './shell.module.css';
import { Breadcrumbs } from './Breadcrumbs';
import { PasswordSignIn, SignInWithGoogle, SignOutButton } from './SessionButtons';
import { SignInShell } from './SignInShell';
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

  return (
    <Shell
      user={{ name: displayName, role: roleLabels[session.role], avatar: session.avatar }}
      menu={
        <>
          <span className={shell.menuEmail}>{session.email}</span>
          <Link href="/" target="_blank">
            View store
          </Link>
          <SignOutButton compact />
        </>
      }
      sidebar={
        <>
          <Link href="/admin" className={shell.brand}>
            <span className={shell.brandMark} aria-hidden="true">
              SC
            </span>
            <span className={shell.brandText}>
              <strong>Sleek Connect</strong>
              <span>Store admin</span>
            </span>
          </Link>
          <AdminNav role={session.role} />
        </>
      }
    >
      <Breadcrumbs />
      {children}
    </Shell>
  );
}
