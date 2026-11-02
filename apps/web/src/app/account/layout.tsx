import { SiteHeader } from '@/components/SiteHeader';
import { AccountShell } from './AccountShell';

/** Every account page (no footer): the site header, then the account menu on the left (once signed in) and the page beside it. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <AccountShell>{children}</AccountShell>
    </>
  );
}
