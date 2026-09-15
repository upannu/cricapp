import { PartnershipDetailClient } from "@/components/PartnershipDetailClient";

export default async function AdminPartnershipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartnershipDetailClient id={id} />;
}
