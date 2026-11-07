import { getPaymentProvider } from '@/lib/payments';

/** What online payment offers right now, so the app can show the right choices. Nothing secret. */
export async function GET() {
  const provider = getPaymentProvider();
  return Response.json(
    { online: provider !== null, card: provider?.supportsCard ?? false, hosted: provider?.hostedCheckout ?? false },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
