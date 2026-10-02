import { LiveScoringClient } from "@/components/LiveScoringClient";

export default async function ScoreMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveScoringClient matchId={id} />;
}
