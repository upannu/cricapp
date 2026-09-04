import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanAccessPlayer, findAuthUserByEmail, mergeLinkedIdentities } from "@/lib/server-auth";
import type { LinkedIdentity } from "@/lib/types";

/**
 * Best-effort, fire-and-forget follow-up called right after a new player is added — see
 * insertPlayer()/insertPlayers() call sites in PlayersClient.tsx/AcademyClient.tsx.
 *
 * Guardian-to-player linking (complete-signup, request-signup-link, approve-user's "link" branch)
 * only ever runs once, at the moment a parent/player account is created or approved — it's a
 * snapshot of whichever players matched that email *at that instant*. A guardian who signs up
 * before a second (or third) child is added to the roster never gets those later children linked
 * automatically; nothing re-checks. This route is that re-check, run every time a player is added
 * rather than only at signup time.
 *
 * Deliberately narrow about what it's willing to grant: it only ever extends a role the account
 * *already holds* (player and/or parent) to also cover the new player — it never invents a
 * player/parent role for an account that never had one, even if the email happens to match (e.g.
 * a coach whose email a family also used for a kid by coincidence).
 */
export async function POST(request: Request) {
  const { playerIds } = (await request.json()) as { playerIds?: string[] };
  if (!playerIds || playerIds.length === 0) {
    return NextResponse.json({ error: "playerIds is required." }, { status: 400 });
  }

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let linked = 0;
  for (const playerId of playerIds) {
    // Re-derives everything from the DB rather than trusting client-supplied emails — a caller
    // could otherwise use this route to force-relink players outside their own scope.
    if (!(await callerCanAccessPlayer(supabase, caller, playerId))) continue;

    const { data: player } = await supabase.from("players").select("id, email").eq("id", playerId).maybeSingle();
    if (!player?.email) continue;

    const { user: account } = await findAuthUserByEmail(supabase, player.email as string);
    if (!account) continue;

    const meta = account.app_metadata ?? {};
    const currentIdentities = meta.linkedIdentities as LinkedIdentity[] | undefined;
    const seeded: LinkedIdentity[] = currentIdentities && currentIdentities.length > 0
      ? currentIdentities
      : [{ role: meta.role as LinkedIdentity["role"], playerId: meta.player_id as string | undefined }];

    const heldRoles = new Set(seeded.map((li) => li.role).filter((role) => role === "player" || role === "parent"));
    if (heldRoles.size === 0) continue; // never grants a role this account never had

    const candidates: LinkedIdentity[] = [...heldRoles].map((role) => ({ role, playerId: player.id as string }));
    const linkedIdentities = mergeLinkedIdentities(meta, candidates);
    if (linkedIdentities.length === seeded.length) continue; // already fully linked, nothing new

    const { error } = await supabase.auth.admin.updateUserById(account.id, {
      app_metadata: { ...meta, linkedIdentities },
    });
    if (!error) linked++;
  }

  return NextResponse.json({ linked });
}
