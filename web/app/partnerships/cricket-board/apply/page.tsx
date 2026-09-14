import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { PartnershipApplicationForm } from "@/components/PartnershipApplicationForm";

export const metadata = { title: "Apply for Partnership — CRIC HQ" };

export default function CricketBoardApplyPage() {
  return (
    <PartnershipPageShell minimal>
      <PartnershipApplicationForm />
    </PartnershipPageShell>
  );
}
