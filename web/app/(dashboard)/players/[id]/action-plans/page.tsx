import { notFound } from "next/navigation";
import { fetchPlayerServer } from "@/lib/supabase-server";
import { ActionPlansClient } from "@/components/ActionPlansClient";

export default async function ActionPlansPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await fetchPlayerServer(id);
  if (!player) notFound();

  return <ActionPlansClient player={player} />;
}
