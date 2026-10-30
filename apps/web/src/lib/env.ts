/**
 * Environment validation (P0 item 3).
 *
 * The check reports the NAMES of the variables that are missing and never their values, so a startup log line
 * or an `/api/health` response can say what is wrong without ever exposing a secret.
 */

const PUBLIC_REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const;

function present(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.trim() !== '';
}

function missingFrom(names: readonly string[]): string[] {
  return names.filter((name) => !present(name));
}

/** Required everywhere the server runs: the build, development and production. */
export function missingPublicEnv(): string[] {
  return missingFrom(PUBLIC_REQUIRED);
}

/**
 * Required of a running server: payments, messaging and the staff console all need the server-only key, and a
 * payment provider is useless without the secret that authenticates its notifications.
 * A Vercel production deployment is additionally held to the site address and the scheduled retry job.
 */
export function missingServerEnv(): string[] {
  const missing: string[] = [];
  if (process.env.NODE_ENV === 'production' && !present('SUPABASE_SECRET_KEY')) missing.push('SUPABASE_SECRET_KEY');
  if (present('PAYMENT_PROVIDER') && !present('PAYMENT_WEBHOOK_SECRET')) missing.push('PAYMENT_WEBHOOK_SECRET');
  if (process.env.VERCEL_ENV === 'production') {
    if (!present('SITE_URL')) missing.push('SITE_URL');
    if (!present('CRON_SECRET')) missing.push('CRON_SECRET');
  }
  return missing;
}

/** Every required variable for this environment, names only, without duplicates. */
export function missingEnv(): string[] {
  return [...new Set([...missingPublicEnv(), ...missingServerEnv()])];
}
