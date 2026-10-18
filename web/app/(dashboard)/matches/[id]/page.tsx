import { MatchScorecardClient } from "@/components/MatchScorecardClient";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchScorecardClient matchId={id} />;
}
