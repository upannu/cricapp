import { CompetitionDetailClient } from "@/components/CompetitionDetailClient";

export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompetitionDetailClient competitionId={id} />;
}
