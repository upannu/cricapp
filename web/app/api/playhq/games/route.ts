import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { fetchOrganisationSeasons, fetchSeasonGrades, fetchGradeGames, PlayHQApiError, type PlayHQGame } from "@/lib/playhq";

/** Lists an academy's completed PlayHQ games available to import — chains seasons -> grades ->
 * games for the connected organisation, then drops any game already imported (playhq_game_id
 * already present on a matches row). */
export async function GET(request: Request) {
  const academyId = new URL(request.url).searchParams.get("academyId");
  if (!academyId) return NextResponse.json({ error: "academyId is required." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const canManage = caller.role === "platform_admin" || (caller.role === "academy_admin" && caller.academyId === academyId);
  if (!canManage) {
    return NextResponse.json({ error: "You don't have access to this academy's PlayHQ games." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: academyRow, error: academyError } = await supabase
    .from("academies").select("playhq_org_id").eq("id", academyId).maybeSingle();
  if (academyError) return NextResponse.json({ error: academyError.message }, { status: 500 });
  const orgId = academyRow?.playhq_org_id as string | null | undefined;
  if (!orgId) return NextResponse.json({ error: "This academy isn't connected to PlayHQ yet." }, { status: 400 });

  try {
    const seasons = await fetchOrganisationSeasons(orgId);
    const games: PlayHQGame[] = [];
    for (const season of seasons) {
      const grades = await fetchSeasonGrades(season.id);
      for (const grade of grades) {
        const gradeGames = await fetchGradeGames(grade.id);
        games.push(...gradeGames.filter((g) => g.status === "COMPLETED"));
      }
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("matches").select("playhq_game_id").not("playhq_game_id", "is", null);
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    const alreadyImported = new Set(
      ((existingRows ?? []) as { playhq_game_id: string | null }[]).map((r) => r.playhq_game_id),
    );

    return NextResponse.json({ games: games.filter((g) => !alreadyImported.has(g.id)) });
  } catch (err) {
    const message = err instanceof PlayHQApiError ? err.message : "Could not fetch games from PlayHQ.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
