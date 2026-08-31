import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

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
