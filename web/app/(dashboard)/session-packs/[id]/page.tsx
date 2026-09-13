import { MembershipProfileClient } from "@/components/MembershipProfileClient";

export default async function MembershipProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MembershipProfileClient packId={id} />;
}
