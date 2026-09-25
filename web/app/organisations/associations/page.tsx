import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { Eyebrow, EditorialButton, EditorialHeading, CapabilityGrid, PageHero } from "@/components/editorial/EditorialUI";

// Coach management, player pathways and performance insights are real, delivered
// capabilities today. The multi-organisation/affiliation layer (regions, affiliated clubs,
// competitions, association-wide reporting) would need an association-level data model the
// app doesn't have yet (see lib/types.ts's UserRole — no board/association role exists,
// same gap noted on the /partnerships/cricket-board page), so those are phrased as
// partnership-shaped ("designed to help", "can be shaped to") rather than delivered features.
const CAPABILITIES = [
  { title: "Club & Academy Management", body: "Designed to help you oversee affiliated clubs and academies from one place." },
  { title: "Affiliation Management", body: "CRIC HQ partnerships can be shaped to manage your affiliated organisations as your association grows." },
  { title: "Coach Management", body: "Manage coaches and coaching programs, connected to player development." },
  { title: "Player Pathways", body: "Track player development through sessions, reports and coaching plans as players progress." },
  { title: "Programs & Competitions", body: "Designed to help you manage programs and competitions across your affiliated clubs and academies." },
  { title: "Centralised Data", body: "Reduce fragmented systems by bringing player, coaching and program information into one connected platform." },
  { title: "Performance Insights", body: "Understand performance across your association through AI-assisted biomechanics reports and insights." },
  { title: "Organisation-wide Reporting", body: "Reporting that can be extended to give your association visibility across participation, development and performance." },
];

export const metadata = {
  title: "CRIC HQ for Cricket Associations | Connected Cricket Management",
  description: "Connect regions, clubs, academies, coaches and player pathways in one platform built for cricket associations.",
};

export default function AssociationsPage() {
  return (
    <PartnershipPageShell>
      <PageHero image="/hp/flywheel.jpg">
        <div className="flex justify-center mb-6"><Eyebrow>For Cricket Associations</Eyebrow></div>
        <EditorialHeading size="lg" level="h1">CRIC HQ for Cricket Associations</EditorialHeading>
        <p className="text-lg text-hp-paper/70 max-w-2xl mx-auto mt-6 mb-3">
          Connect your cricket ecosystem in one platform.
        </p>
        <p className="text-sm text-hp-paper/50 max-w-xl mx-auto mb-8">
          Connect clubs, academies, coaches and player pathways while giving your association greater visibility across development and performance.
        </p>
        <EditorialButton href="/organisations/associations/apply" size="lg">Register Your Interest</EditorialButton>
      </PageHero>

      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hierarchy */}
        <div className="mb-16">
          <div className="text-center mb-2"><EditorialHeading size="sm">One Connected Cricket Ecosystem</EditorialHeading></div>
          <p className="text-sm text-hp-paper/50 text-center max-w-2xl mx-auto mb-10">
            Connect the organisations, people and programs that support player development — from association level through to the player.
          </p>
          <div className="border border-white/8 p-10 flex flex-col items-center gap-3">
            {["Cricket Association", "Regions / Districts", "Clubs / Academies", "Programs", "Coaches"].map((step) => (
              <div key={step} className="flex flex-col items-center gap-3">
                <div className="px-5 py-2.5 border border-white/10 text-hp-paper/75 text-sm font-display font-semibold uppercase text-center">
                  {step}
                </div>
                <div className="w-px h-5 bg-white/10" />
              </div>
            ))}
            <div className="px-5 py-2.5 border border-hp-cg/30 bg-hp-cg/5 text-hp-cg text-sm font-display font-bold uppercase">
              Players
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <div className="text-center mb-10"><EditorialHeading size="sm">Built for Cricket Associations</EditorialHeading></div>
          <CapabilityGrid items={CAPABILITIES} cols={3} />
        </div>

        {/* Final CTA */}
        <div className="text-center pb-20">
          <EditorialHeading size="sm">Ready to Connect Your Cricket Association?</EditorialHeading>
          <p className="text-sm text-hp-paper/50 mt-4 mb-8">
            Tell us about your association and explore how CRIC HQ could support your cricket ecosystem.
          </p>
          <EditorialButton href="/organisations/associations/apply" size="lg">Register Your Interest</EditorialButton>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
