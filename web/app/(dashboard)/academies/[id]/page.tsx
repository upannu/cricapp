import { notFound } from "next/navigation";
import { canAccessAcademyServer } from "@/lib/supabase-server";
import { AcademyProfileClient } from "@/components/AcademyProfileClient";

export default async function AcademyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await canAccessAcademyServer(id))) notFound();
  return <AcademyProfileClient academyId={id} />;
}
