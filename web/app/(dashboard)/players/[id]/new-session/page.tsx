import { notFound } from "next/navigation";
import { fetchPlayerServer, canAccessPlayerServer } from "@/lib/supabase-server";
import { NewSessionForm } from "@/components/NewSessionForm";

export default async function NewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bookingId?: string }>;
}) {
  const { id } = await params;
  const { bookingId } = await searchParams;
  const player = await fetchPlayerServer(id);
  if (!player || !(await canAccessPlayerServer(id))) notFound();

  return <NewSessionForm player={player} bookingId={bookingId} />;
}
