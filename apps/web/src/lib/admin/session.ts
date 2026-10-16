import 'server-only';
import { connection } from 'next/server';
import { cache } from 'react';
import { createUserSupabase } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type StaffRole = Database['public']['Enums']['staff_role'];

export type StaffSession =
  | { state: 'signed_out' }
  | { state: 'not_staff'; email: string | undefined }
  | { state: 'needs_mfa'; email: string | undefined; role: StaffRole; enrolled: boolean }
  | {
      state: 'ready';
      email: string | undefined;
      role: StaffRole;
      supabase: Awaited<ReturnType<typeof createUserSupabase>>;
    };

/**
 * Who is using the admin console, once per request. The database enforces the same rules on every query, so this
 * only decides what to show.
 */
export const getStaffSession = cache(async (): Promise<StaffSession> => {
  // Always per request: the session decides everything on the page (and the auth client reads the clock).
  await connection();
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: 'signed_out' };

  const { data: access } = await supabase.rpc('my_staff_access').maybeSingle();
  if (!access) return { state: 'not_staff', email: user.email };
  if (!access.mfa_verified) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return { state: 'needs_mfa', email: user.email, role: access.role, enrolled: aal?.nextLevel === 'aal2' };
  }
  return { state: 'ready', email: user.email, role: access.role, supabase };
});

/** The verified staff session for a page, or null (the layout then shows sign-in or verification instead). */
export async function requireStaffPage() {
  const session = await getStaffSession();
  return session.state === 'ready' ? session : null;
}

const permissions = {
  'catalogue.edit': ['catalogue'],
  'stock.edit': ['operations'],
  'recall': ['catalogue', 'operations'],
  'orders.fulfil': ['operations'],
  'orders.cancel': ['operations', 'support'],
  'orders.review': ['operations', 'support'],
  'orders.refund': ['finance', 'operations'],
  'riders.edit': ['operations'],
  'staff.manage': [],
} satisfies Record<string, StaffRole[]>;

export type Permission = keyof typeof permissions;

/** Mirrors the role checks in the database functions, to hide controls a role can't use. Admins can do everything. */
export function can(role: StaffRole, permission: Permission): boolean {
  return role === 'admin' || (permissions[permission] as StaffRole[]).includes(role);
}

export const roleLabels: Record<StaffRole, string> = {
  admin: 'Admin',
  catalogue: 'Catalogue',
  operations: 'Operations',
  support: 'Support',
  finance: 'Finance',
  read_only: 'Read-only',
};
