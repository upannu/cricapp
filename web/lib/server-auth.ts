import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface Caller {
  userId: string;
  role?: string;
  academyId?: string;
  coachId?: string;
  playerId?: string;
}

/** Identifies the calling user from their session cookie — the same pattern already used across every Stripe route. Returns null if not signed in. */
export async function getCaller(): Promise<Caller | null> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  return {
    userId: user.id,
    role: user.app_metadata?.role,
    academyId: user.app_metadata?.academy_id,
    coachId: user.app_metadata?.coach_id,
    playerId: user.app_metadata?.player_id,
  };
}

/**
 * Ownership check for privileged (service-role) routes that act on a specific player —
 * platform_admin can always act; academy_admin only within their own academy's roster;
 * coach only on their own assigned players; player/parent only on themselves.
 */
export async function callerCanAccessPlayer(
  supabase: SupabaseClient,
  caller: Caller,
  targetPlayerId: string,
): Promise<boolean> {
  if (caller.role === "platform_admin") return true;
  if (caller.role === "player" || caller.role === "parent") return caller.playerId === targetPlayerId;
  if (caller.role === "coach") {
    if (!caller.coachId) return false;
    const { data } = await supabase.from("players").select("coach_id").eq("id", targetPlayerId).single();
    return data?.coach_id === caller.coachId;
  }
  if (caller.role === "academy_admin") {
    if (!caller.academyId) return false;
    const { data } = await supabase.from("academies").select("player_ids").eq("id", caller.academyId).single();
    return !!(data?.player_ids as string[] | undefined)?.includes(targetPlayerId);
  }
  return false;
}

/**
 * Finds a Supabase Auth user by email — the Admin API has no server-side "search by email"
 * endpoint, so paging through listUsers() is the standard way to do this. Every call site that
 * needed this used to fetch a single page (perPage: 1000) and stop there, meaning any account
 * created after the 1000th signup would silently fail every one of those lookups (approve-user,
 * check-existing-account, reject-user, request-additional-role) with no error explaining why —
 * this app is meant to grow well past 1000 users. Pages through the full list (1000 per page,
 * matching the existing call sites) until found or exhausted.
 */
export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<{ user: User | null; error: string | null }> {
  const target = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { user: null, error: error.message };
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return { user: match, error: null };
    if (!data.nextPage) return { user: null, error: null };
    page = data.nextPage;
  }
}

/**
 * Every Auth user, across all pages — the same underlying truncation risk as
 * findAuthUserByEmail above, but for call sites that need to scan/filter the whole user base
 * (send-plan-email finds every academy_admin for an academy; platform-admins/list finds every
 * platform_admin) rather than find one match and stop. 1000 per page, same as the rest of this
 * app's listUsers() calls.
 */
export async function listAllAuthUsers(
  supabase: SupabaseClient,
): Promise<{ users: User[]; error: string | null }> {
  const users: User[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { users, error: error.message };
    users.push(...data.users);
    if (!data.nextPage) return { users, error: null };
    page = data.nextPage;
  }
}
