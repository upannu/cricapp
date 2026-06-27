import { PlayerProfileClient } from "@/components/PlayerProfileClient";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlayerProfileClient playerId={id} />;
}
