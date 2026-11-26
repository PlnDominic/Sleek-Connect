import { SiteHeader } from '@/components/SiteHeader';
import { AccountShell } from '../account/AccountShell';

/** Saved items sits inside the account frame (menu on the left once signed in), without the footer. */
export default function SavedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <AccountShell>{children}</AccountShell>
    </>
  );
}
