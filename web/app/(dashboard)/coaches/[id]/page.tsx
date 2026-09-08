import { notFound } from "next/navigation";
import { canAccessCoachServer } from "@/lib/supabase-server";
import { CoachProfileClient } from "@/components/CoachProfileClient";

export default async function CoachProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await canAccessCoachServer(id))) notFound();
  return <CoachProfileClient coachId={id} />;
}
