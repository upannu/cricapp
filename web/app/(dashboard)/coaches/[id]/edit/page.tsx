import { notFound } from "next/navigation";
import { fetchCoachServer, canAccessCoachServer } from "@/lib/supabase-server";
import { EditCoachForm } from "@/components/EditCoachForm";

export default async function EditCoachPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const coach = await fetchCoachServer(id);
  if (!coach || !(await canAccessCoachServer(id))) notFound();

  return <EditCoachForm coach={coach} />;
}
