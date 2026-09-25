import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { QuickPartnershipForm } from "@/components/QuickPartnershipForm";

const PLAYER_SCALE = ["1–10", "11–25", "26–50", "51–100", "100+"];

export const metadata = { title: "Register Coaching Interest — CRIC HQ" };

export default function CoachApplyPage() {
  return (
    <PartnershipPageShell minimal backgroundImage="/hp/what-is.jpg">
      <QuickPartnershipForm
        orgType="Coach"
        heading="Register Coaching Interest"
        subheading="Tell us a little about your coaching business — we'll be in touch."
        nameLabel="Your Name / Business Name"
        namePlaceholder="e.g. Alex Smith Cricket Coaching"
        roleLabel="Your Role"
        scaleQuestion={{ label: "Approximately how many players do you work with?", options: PLAYER_SCALE, field: "scalePlayers" }}
        backHref="/organisations/coaches"
      />
    </PartnershipPageShell>
  );
}
