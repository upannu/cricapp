import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { Eyebrow, EditorialButton, EditorialHeading, CapabilityGrid } from "@/components/editorial/EditorialUI";

// All real — the biomechanics report pipeline, development plans, coach notes/assessments, and
// academy progress tracking already exist and are already in daily use. No match-level stats
// (batting/bowling/fielding averages) are claimed here — those depend on match scoring, which
// isn't built yet.
const CAPABILITIES = [
  { title: "AI Biomechanics Reports", body: "Skeleton-tracked pose analysis from any phone video — front knee angle, release position, ball speed, injury-risk flag." },
  { title: "Human-Validated, Not Automated", body: "Every AI-generated report is reviewed by a coach before an athlete ever sees it." },
  { title: "Development Plans", body: "Set priorities and track each player's progress toward them over time." },
  { title: "Coach Notes & Assessments", body: "Structured assessments and notes captured alongside every session." },
  { title: "Academy Progress", body: "Stage, completion percentage and XP tracked as a player moves through a program." },
  { title: "Video-Based Review", body: "Upload and tag footage from squad sessions as part of ongoing coach feedback." },
];

export const metadata = {
  title: "Performance Intelligence | CRIC HQ",
  description: "AI-assisted, human-validated biomechanics reporting and development tracking — the performance intelligence layer behind CRIC HQ.",
};

export default function PerformanceIntelligencePage() {
  return (
    <PartnershipPageShell>
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hero */}
        <div className="pt-14 pb-16 text-center">
          <div className="flex justify-center mb-6"><Eyebrow>Performance Intelligence</Eyebrow></div>
          <EditorialHeading size="lg" level="h1">Every Degree of the Action, Measured.</EditorialHeading>
          <p className="text-lg text-hp-paper/70 max-w-2xl mx-auto mt-6 mb-3">
            No lab. No lasers. AI-assisted biomechanics from any phone video, reviewed by a coach before it reaches the athlete.
          </p>
          <EditorialButton href="/contact" size="lg">Talk to Us</EditorialButton>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <div className="text-center mb-10"><EditorialHeading size="sm">What&apos;s Real Today</EditorialHeading></div>
          <CapabilityGrid items={CAPABILITIES} cols={3} />
        </div>

        {/* Honesty note — no fabricated match stats on this page either */}
        <div className="mb-16 border border-dashed border-white/15 p-6 text-center">
          <p className="text-hp-paper/50 text-sm">
            Match-level batting, bowling and fielding statistics will appear here once live scoring is built. What is above is real and in use today.
          </p>
        </div>

        {/* Final CTA */}
        <div className="text-center pb-20">
          <EditorialHeading size="sm">See Performance Intelligence in Action</EditorialHeading>
          <p className="text-sm text-hp-paper/50 mt-4 mb-8">
            Talk to us about bringing AI-assisted biomechanics reporting to your players.
          </p>
          <EditorialButton href="/contact" size="lg">Talk to Us</EditorialButton>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
