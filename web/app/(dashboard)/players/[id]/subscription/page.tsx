import { notFound, redirect } from "next/navigation";
import { fetchPlayerServer, canAccessPlayerServer, isAcademyPlayerServer } from "@/lib/supabase-server";
import { SubscriptionPage } from "@/components/SubscriptionPage";

export default async function ManageSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await fetchPlayerServer(id);
  if (!player || !(await canAccessPlayerServer(id))) notFound();
  // Academy players' access comes from the academy's own plan — no personal subscription to manage.
  if (await isAcademyPlayerServer(id)) redirect(`/players/${id}`);

  return <SubscriptionPage player={player} />;
}
