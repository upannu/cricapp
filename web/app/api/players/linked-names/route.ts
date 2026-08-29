import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

interface LinkedIdentity {
  role: string;
  academyId?: string;
  coachId?: string;
  playerId?: string;
}

/** NavBar's role-switcher needs a real name (not just "Player" ×2) to tell two linked children
 * apart — but RLS only lets a player/parent read their currently-*active* player row, not every
 * linked one, so this is a dedicated service-role lookup, same pattern as every other
 * cross-cutting read in this app. Only ever returns players already present in the caller's own
 * linkedIdentities — never an arbitrary id a client might pass in. */
export async function POST(request: Request) {
  const { playerIds } = (await request.json()) as { playerIds?: string[] };
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return NextResponse.json({ error: "playerIds is required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const meta = caller.app_metadata ?? {};
  const linkedIdentities = (meta.linkedIdentities as LinkedIdentity[] | undefined) ?? [];
  const ownPlayerIds = new Set(
    linkedIdentities.map((li) => li.playerId).filter((id): id is string => !!id),
  );
  const ownPlayerId = meta.player_id as string | undefined;
  if (ownPlayerId) ownPlayerIds.add(ownPlayerId);

  const requested = playerIds.filter((id) => ownPlayerIds.has(id));
  if (requested.length === 0) return NextResponse.json({ players: [] });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: players } = await supabase
    .from("players")
    .select("id, name, coach_id")
    .in("id", requested);
  if (!players) return NextResponse.json({ players: [] });

  const coachIds = [...new Set(players.map((p) => p.coach_id).filter((id): id is string => !!id))];
  const { data: coaches } = coachIds.length > 0
    ? await supabase.from("coaches").select("id, academy_id").in("id", coachIds)
    : { data: [] as { id: string; academy_id: string | null }[] };
  const coachToAcademy = new Map((coaches ?? []).map((c) => [c.id, c.academy_id]));

  const academyIds = [...new Set([...coachToAcademy.values()].filter((id): id is string => !!id))];
  const { data: academies } = academyIds.length > 0
    ? await supabase.from("academies").select("id, name").in("id", academyIds)
    : { data: [] as { id: string; name: string }[] };
  const academyNames = new Map((academies ?? []).map((a) => [a.id, a.name]));

  const result = players.map((p) => {
    const academyId = p.coach_id ? coachToAcademy.get(p.coach_id) : null;
    return { id: p.id, name: p.name, academyName: academyId ? academyNames.get(academyId) ?? null : null };
  });

  return NextResponse.json({ players: result });
}
