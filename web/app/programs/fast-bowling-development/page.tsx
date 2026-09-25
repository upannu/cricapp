import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { Eyebrow, EditorialButton, EditorialHeading, CapabilityGrid, PageHero } from "@/components/editorial/EditorialUI";

// The three pillars are grouped intentionally: Coach Development and Athlete Development
// describe the program itself (coach-led, hedged where the coach-pathway/certification model
// isn't finalised yet), while Performance Intelligence is deliberately confident — it maps
// directly onto CRIC HQ's existing reports/review pipeline, not a future feature.
const PILLARS = [
  { title: "Coach Development", body: "A structured coach development pathway, from foundational fast bowling coaching through to advanced practical work." },
  { title: "Athlete Development", body: "Structured fast bowling development for athletes, connecting training, sessions and coach feedback in one place." },
  { title: "Performance Intelligence", body: "AI-assisted, human-validated performance reporting, giving coaches and athletes a clear view of progress over time." },
];

// Guardian consent and video-based coaching are real, already-shipped CRIC HQ capabilities
// (guardian_consent tracking on player records, video annotations, biomechanics reports with a
// human review step). The pathway/certification and program-wide rollup items are genuinely new
// and are phrased as "designed to help"/"can be shaped to" rather than delivered features.
const CAPABILITIES = [
  { title: "Structured Coach Pathway", body: "Designed to help coaches progress through a staged development pathway, from foundational fast bowling coaching to advanced practical work." },
  { title: "Athlete Development Plans", body: "Set development plans and track progress as athletes work through the program." },
  { title: "Session & Attendance Tracking", body: "Plan sessions and track attendance across the program." },
  { title: "AI-Assisted, Human-Validated Reporting", body: "Performance reports covering technical and physical progress, reviewed by a coach before they reach the athlete." },
  { title: "Video-Based Coaching", body: "Capture and review footage as part of ongoing coach feedback." },
  { title: "Coach Notes & Assessments", body: "Coach assessments and notes captured alongside every session." },
  { title: "Guardian Consent & Athlete Welfare", body: "Built on CRIC HQ's existing guardian consent and athlete data protections for junior athletes." },
  { title: "Program-Wide Visibility", body: "Designed to give program leads visibility across athletes and coaches as the program grows." },
];

export const metadata = {
  title: "Fast Bowling Development Program | CRIC HQ",
  description: "A specialist fast bowling development ecosystem combining coach development, athlete development and AI-assisted, human-validated performance intelligence.",
};

export default function FastBowlingDevelopmentPage() {
  return (
    <PartnershipPageShell>
      <PageHero image="/hp/performance.jpg">
        <div className="flex justify-center mb-6"><Eyebrow>Specialist Development Program</Eyebrow></div>
        <EditorialHeading size="lg" level="h1">Build Better Fast Bowlers. Build Better Coaches.</EditorialHeading>
        <p className="text-lg text-hp-paper/70 max-w-2xl mx-auto mt-6 mb-3">
          A complete fast bowling development ecosystem combining specialist coaching, athlete development and CRIC HQ technology.
        </p>
        <p className="text-sm text-hp-paper/50 max-w-xl mx-auto mb-8">
          Delivered by a specialist fast bowling coaching lead, powered by the CRIC HQ platform.
        </p>
        <EditorialButton href="/programs/fast-bowling-development/apply" size="lg">Register Your Interest</EditorialButton>
      </PageHero>

      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Three pillars */}
        <div className="mb-16">
          <div className="text-center mb-10"><EditorialHeading size="sm">Coach. Athlete. Intelligence.</EditorialHeading></div>
          <CapabilityGrid items={PILLARS} cols={3} />
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <div className="text-center mb-10"><EditorialHeading size="sm">What the Program Includes</EditorialHeading></div>
          <CapabilityGrid items={CAPABILITIES} cols={3} />
        </div>

        {/* Final CTA */}
        <div className="text-center pb-20">
          <EditorialHeading size="sm">Ready to Bring Fast Bowling Development to Your Organisation?</EditorialHeading>
          <p className="text-sm text-hp-paper/50 mt-4 mb-8">
            Available for academies, coaches and associations, and as part of a full Cricket Board partnership for federation-wide rollout.
          </p>
          <EditorialButton href="/programs/fast-bowling-development/apply" size="lg">Register Your Interest</EditorialButton>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
