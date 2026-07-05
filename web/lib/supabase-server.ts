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
