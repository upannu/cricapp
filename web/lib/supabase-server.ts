import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { dbToPlayer, dbToReport, dbToArticle, dbToArticleRead, type DbPlayer, type DbReport, type DbArticle, type DbArticleRead } from "@/lib/db";
import { STAGE_ORDER } from "@/lib/academy-content";
import type { Player, Report, Article, ArticleRead } from "@/lib/types";

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

/**
 * Ownership check for the /players/[id]/* server-rendered routes — without this, any
 * logged-in coach/academy_admin could view or edit another academy's player just by
 * changing the URL, since fetchPlayerServer itself has no scoping.
 */
export async function canAccessPlayerServer(targetPlayerId: string): Promise<boolean> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const role = user.user_metadata?.role as string | undefined;
  if (role === "platform_admin") return true;
  if (role === "player" || role === "parent") return user.user_metadata?.player_id === targetPlayerId;
  if (role === "coach") {
    const coachId = user.user_metadata?.coach_id as string | undefined;
    if (!coachId) return false;
    const { data } = await sb.from("players").select("coach_id").eq("id", targetPlayerId).single();
    return data?.coach_id === coachId;
  }
  if (role === "academy_admin") {
    const academyId = user.user_metadata?.academy_id as string | undefined;
    if (!academyId) return false;
    const { data } = await sb.from("academies").select("player_ids").eq("id", academyId).single();
    return !!(data?.player_ids as string[] | undefined)?.includes(targetPlayerId);
  }
  return false;
}

/**
 * Academy players get their access through the academy's own plan — the personal
 * Player Pro/Coach Pro subscription page doesn't apply to them.
 */
export async function isAcademyPlayerServer(playerId: string): Promise<boolean> {
  const sb = await createClient();
  const { count } = await sb
    .from("academies")
    .select("id", { count: "exact", head: true })
    .contains("player_ids", [playerId]);
  return !!count && count > 0;
}

export async function fetchReportsServer(playerId?: string): Promise<Report[]> {
  const sb = await createClient();
  let q = sb.from("reports").select("*").order("date", { ascending: false });
  if (playerId) q = q.eq("player_id", playerId);
  const { data, error } = await q;
  if (error) return [];
  return (data as DbReport[]).map(dbToReport);
}

export async function fetchArticlesServer(): Promise<Article[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("articles").select("*").eq("published", true).order("order_in_stage");
  if (error) return [];
  const articles = (data as DbArticle[]).map(dbToArticle);
  return articles.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.orderInStage - b.orderInStage);
}

export async function fetchArticleReadsServer(playerId: string): Promise<ArticleRead[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("article_reads").select("*").eq("player_id", playerId);
  if (error) return [];
  return (data as DbArticleRead[]).map(dbToArticleRead);
}
