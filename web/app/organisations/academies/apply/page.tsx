import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { QuickPartnershipForm } from "@/components/QuickPartnershipForm";

const PLAYER_SCALE = ["1–25", "26–50", "51–100", "101–250", "250+"];

export const metadata = { title: "Register Academy Interest — CRIC HQ" };

export default function AcademyApplyPage() {
  return (
    <PartnershipPageShell minimal>
      <QuickPartnershipForm
        orgType="Academy"
        heading="Register Academy Interest"
        subheading="Tell us a little about your academy — we'll be in touch."
        nameLabel="Academy Name"
        namePlaceholder="e.g. Western Suburbs Cricket Academy"
        roleLabel="Your Role"
        scaleQuestion={{ label: "Approximately how many players?", options: PLAYER_SCALE, field: "scalePlayers" }}
        backHref="/organisations/academies"
      />
    </PartnershipPageShell>
  );
}
