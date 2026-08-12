import { notFound } from "next/navigation";
import { fetchPlayerServer, canAccessPlayerServer } from "@/lib/supabase-server";
import { SCLogClient } from "@/components/SCLogClient";

export default async function SCLogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await fetchPlayerServer(id);
  if (!player || !(await canAccessPlayerServer(id))) notFound();

  return <SCLogClient player={player} />;
}
