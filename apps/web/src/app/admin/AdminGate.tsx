import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { getStaffSession, roleLabels } from '@/lib/admin/session';
import { MfaEnroll, MfaVerify } from './Mfa';
import { AdminNav } from './AdminNav';
import { SignInWithGoogle, SignOutButton } from './SessionButtons';
import styles from './admin.module.css';

/** Staff must be signed in, on the staff list and verified with their authenticator app (PRD FR-107). */
export async function AdminGate({ children }: { children: ReactNode }) {
  const session = await getStaffSession();

  if (session.state !== 'ready') {
    return (
      <div className={styles.gate}>
        <div className={styles.gateCard}>
          <Logo />
          {session.state === 'signed_out' && (
            <>
              <h1>Staff sign-in</h1>
              <p>Sign in with the Google account your admin added to the staff list.</p>
              <SignInWithGoogle />
            </>
          )}
          {session.state === 'not_staff' && (
            <>
              <h1>No staff access</h1>
              <p>
                {session.email ?? 'This account'} isn’t on the staff list. Ask an admin to add you, then sign in
                again.
              </p>
              <SignOutButton />
            </>
          )}
          {session.state === 'needs_mfa' &&
            (session.enrolled ? (
              <>
                <h1>Two-step verification</h1>
                <p>Enter the 6-digit code from your authenticator app.</p>
                <MfaVerify />
              </>
            ) : (
              <>
                <h1>Set up two-step verification</h1>
                <p>
                  Staff accounts need an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).
                  Scan the code, then enter the 6-digit code it shows.
                </p>
                <MfaEnroll />
              </>
            ))}
          <Link href="/" className={styles.muted}>
            Back to the store
          </Link>
        </div>
      </div>
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
