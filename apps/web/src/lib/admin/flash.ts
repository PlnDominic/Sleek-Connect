import 'server-only';
import { redirect } from 'next/navigation';

/**
 * Finishes a successful action by reloading `path` with a confirmation banner. Used when the action changes what the
 * page shows (an order's status, a batch's state), which would otherwise remove the form and its message.
 */
export function flash(path: string, message: string): never {
  redirect(`${path}?done=${encodeURIComponent(message)}`);
}
