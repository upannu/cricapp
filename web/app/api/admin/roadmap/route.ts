import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { RoadmapItemStatus } from "@/lib/types";

const VALID_STATUSES: RoadmapItemStatus[] = ["Planned", "In Progress", "Completed"];

async function requirePlatformAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  return caller?.app_metadata?.role === "platform_admin";
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Creates or updates a roadmap item — platform-wide table, so writes go through this
 * service-role route rather than a direct client upsert, same shape as app/api/plans/update. */
export async function POST(request: Request) {
  const input = (await request.json()) as {
    id?: string; title?: string; description?: string; status?: RoadmapItemStatus;
  };
  if (!input.title?.trim()) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (input.status && !VALID_STATUSES.includes(input.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  if (!(await requirePlatformAdmin())) {
    return NextResponse.json({ error: "Only a platform admin can change the roadmap." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = serviceClient();

  const row = {
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    status: input.status ?? "Planned",
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from("platform_roadmap_items").update(row).eq("id", input.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: input.id });
  }

  const { data, error } = await supabase.from("platform_roadmap_items").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  if (!(await requirePlatformAdmin())) {
    return NextResponse.json({ error: "Only a platform admin can change the roadmap." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = serviceClient();

  const { error } = await supabase.from("platform_roadmap_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
