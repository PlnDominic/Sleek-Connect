import 'server-only';
import { connection } from 'next/server';
import { cache } from 'react';
import { createUserSupabase } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type StaffRole = Database['public']['Enums']['staff_role'];

export type StaffSession =
  | { state: 'signed_out' }
  | { state: 'not_staff'; email: string | undefined; name: string | undefined; avatar: string | undefined }
  | {
      state: 'ready';
      email: string | undefined;
      name: string | undefined;
      avatar: string | undefined;
      role: StaffRole;
      supabase: Awaited<ReturnType<typeof createUserSupabase>>;
    };

/**
 * Who is using the admin console, once per request. Staff sign in with Google or an email and password and must be on
 * the staff list; the database enforces the same rules on every query, so this only decides what to show.
 */
export const getStaffSession = cache(async (): Promise<StaffSession> => {
  // Always per request: the session decides everything on the page (and the auth client reads the clock).
  await connection();
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: 'signed_out' };

  // Google fills these in; accounts made with a password usually have neither.
  const meta = user.user_metadata as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const name = meta.full_name ?? meta.name;
  const avatar = meta.avatar_url ?? meta.picture;

  const { data: access } = await supabase.rpc('my_staff_access').maybeSingle();
  if (!access) return { state: 'not_staff', email: user.email, name, avatar };
  return { state: 'ready', email: user.email, name, avatar, role: access.role, supabase };
});

/** The staff session for a page, or null (the layout then shows the sign-in screen instead). */
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
  'content.edit': ['catalogue'],
  'returns.decide': ['support', 'operations'],
  'returns.receive': ['operations'],
  'returns.refund': ['finance', 'operations'],
  'support.reply': ['support', 'operations'],
  'reviews.moderate': ['catalogue', 'support'],
  'staff.manage': [],
  'settings.edit': [],
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
