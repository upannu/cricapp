import { notFound } from "next/navigation";
import { canAccessPlayerServer } from "@/lib/supabase-server";
import { PlayerProfileClient } from "@/components/PlayerProfileClient";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await canAccessPlayerServer(id))) notFound();
  return <PlayerProfileClient playerId={id} />;
}
