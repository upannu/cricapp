import { MembershipEditClient } from "@/components/MembershipEditClient";

export default async function MembershipEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MembershipEditClient packId={id} />;
}
