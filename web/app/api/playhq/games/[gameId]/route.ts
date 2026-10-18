import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { fetchGameSummary, PlayHQApiError } from "@/lib/playhq";

/** Returns one PlayHQ game's full summary (including every player appearance) — used by the
 * import UI's player-matching step to list who needs linking to a real Player before import.
 * The import route (POST /api/playhq/import) re-fetches this itself rather than trusting a
 * client-echoed summary, so this GET is read-only/preview purposes only. */
export async function GET(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const academyId = new URL(request.url).searchParams.get("academyId");
  if (!academyId) return NextResponse.json({ error: "academyId is required." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const canManage = caller.role === "platform_admin" || (caller.role === "academy_admin" && caller.academyId === academyId);
  if (!canManage) {
    return NextResponse.json({ error: "You don't have access to this academy's PlayHQ games." }, { status: 403 });
  }

  try {
    const summary = await fetchGameSummary(gameId);
    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof PlayHQApiError ? err.message : "Could not fetch that game from PlayHQ.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
