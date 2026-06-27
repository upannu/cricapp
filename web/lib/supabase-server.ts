import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { dbToPlayer, dbToReport, type DbPlayer, type DbReport } from "@/lib/db";
import type { Player, Report } from "@/lib/types";

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

export async function fetchPlayerServer(id: string): Promise<Player | null> {
  const sb = await createClient();
  const { data } = await sb.from("players").select("*").eq("id", id).single();
  return data ? dbToPlayer(data as DbPlayer) : null;
}

export async function fetchReportsServer(playerId?: string): Promise<Report[]> {
  const sb = await createClient();
  let q = sb.from("reports").select("*").order("date", { ascending: false });
  if (playerId) q = q.eq("player_id", playerId);
  const { data, error } = await q;
  if (error) return [];
  return (data as DbReport[]).map(dbToReport);
}
