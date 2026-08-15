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

export async function POST(request: Request) {
  const { role, academyId, coachId, playerId } = await request.json();
  if (!role) return NextResponse.json({ error: "role required." }, { status: 400 });

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const meta = caller.user_metadata ?? {};
  const linkedIdentities = (meta.linkedIdentities as LinkedIdentity[] | undefined) ?? [];

  // Never trust the client to supply an arbitrary target — the requested identity must already
  // be present in this account's own linkedIdentities (set only via an approved link request).
  const target = linkedIdentities.find((li) =>
    li.role === role &&
    (li.academyId ?? undefined) === (academyId ?? undefined) &&
    (li.coachId ?? undefined) === (coachId ?? undefined) &&
    (li.playerId ?? undefined) === (playerId ?? undefined)
  );
  if (!target) return NextResponse.json({ error: "That identity isn't linked to your account." }, { status: 403 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase.auth.admin.updateUserById(caller.id, {
    user_metadata: {
      ...meta,
      role: target.role,
      academy_id: target.academyId ?? null,
      coach_id: target.coachId ?? null,
      player_id: target.playerId ?? null,
    },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
