import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { QuickPartnershipForm } from "@/components/QuickPartnershipForm";

const PLAYER_SCALE = ["1–10", "11–25", "26–50", "51–100", "100+"];

export const metadata = { title: "Register Program Interest — CRIC HQ" };

export default function FastBowlingProgramApplyPage() {
  return (
    <PartnershipPageShell minimal>
      <QuickPartnershipForm
        orgType="Fast Bowling Program"
        heading="Register Program Interest"
        subheading="Tell us a little about your organisation — we'll be in touch."
        nameLabel="Organisation Name"
        namePlaceholder="e.g. Your Academy or Association Name"
        roleLabel="Your Role"
        scaleQuestion={{ label: "Approximately how many fast bowlers would this involve?", options: PLAYER_SCALE, field: "scalePlayers" }}
        backHref="/programs/fast-bowling-development"
      />
    </PartnershipPageShell>
  );
}
