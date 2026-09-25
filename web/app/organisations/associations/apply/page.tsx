import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { QuickPartnershipForm } from "@/components/QuickPartnershipForm";

const ACADEMY_SCALE = ["1–5", "6–20", "21–50", "51–100", "100+"];

export const metadata = { title: "Register Association Interest — CRIC HQ" };

export default function AssociationApplyPage() {
  return (
    <PartnershipPageShell minimal backgroundImage="/hp/flywheel.jpg">
      <QuickPartnershipForm
        orgType="Cricket Association"
        heading="Register Association Interest"
        subheading="Tell us a little about your association — we'll be in touch."
        nameLabel="Association Name"
        namePlaceholder="e.g. Western Region Cricket Association"
        roleLabel="Your Role"
        scaleQuestion={{ label: "How many affiliated clubs or academies?", options: ACADEMY_SCALE, field: "scaleAcademies" }}
        backHref="/organisations/associations"
      />
    </PartnershipPageShell>
  );
}
