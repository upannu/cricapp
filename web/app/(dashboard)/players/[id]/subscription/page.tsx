import { notFound } from "next/navigation";
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
  // Academy players' access comes from the academy's own plan — no main plan to choose or manage
  // billing for here, but they can still buy optional add-ons (Library, Assessment credits), so
  // unlike before they're no longer redirected away from this page entirely.
  const isAcademyPlayer = await isAcademyPlayerServer(id);

  return <SubscriptionPage player={player} isAcademyPlayer={isAcademyPlayer} />;
}
