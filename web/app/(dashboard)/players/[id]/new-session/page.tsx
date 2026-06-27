import { notFound } from "next/navigation";
import { fetchPlayerServer } from "@/lib/supabase-server";
import { NewSessionForm } from "@/components/NewSessionForm";

export default async function NewSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await fetchPlayerServer(id);
  if (!player) notFound();

  return <NewSessionForm player={player} />;
}
