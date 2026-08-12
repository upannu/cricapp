import { notFound } from "next/navigation";
import { fetchPlayerServer, canAccessPlayerServer } from "@/lib/supabase-server";
import { SubscriptionPage } from "@/components/SubscriptionPage";

export default async function ManageSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await fetchPlayerServer(id);
  if (!player || !(await canAccessPlayerServer(id))) notFound();

  return <SubscriptionPage player={player} />;
}
