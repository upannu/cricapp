import { notFound } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { dbToAcademy, type DbAcademy } from "@/lib/db";
import { AcademyBillingClient } from "@/components/AcademyBillingClient";

async function fetchAcademyServer(id: string) {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data } = await sb.from("academies").select("*").eq("id", id).single();
  return data ? dbToAcademy(data as DbAcademy) : null;
}

export default async function AcademyBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const academy = await fetchAcademyServer(id);
  if (!academy) notFound();

  return <AcademyBillingClient academy={academy} />;
}
