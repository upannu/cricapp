import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { Eyebrow, EditorialButton, EditorialHeading, CapabilityGrid, PageHero } from "@/components/editorial/EditorialUI";
import Link from "next/link";

// Every item here maps to a capability that already exists in the CRIC HQ academy-admin
// dashboard today (players, coaches, group sessions/bookings, attendance_records, action
// plans, biomechanics reports, messages) — no hedged/aspirational language needed.
const CAPABILITIES = [
  { title: "Player Management", body: "Manage every player's profile, progress and history in one place." },
  { title: "Coach Management", body: "Onboard coaches, assign players and manage coaching activity across your academy." },
  { title: "Programs & Sessions", body: "Plan and run group sessions, bookings and session packs across your programs." },
  { title: "Attendance", body: "Record attendance for every session and track participation over time." },
  { title: "Player Development", body: "Set development plans and track each player's priorities as they progress." },
  { title: "Performance Tracking", body: "AI-assisted biomechanics reports and performance insights support coaching decisions." },
  { title: "Communication", body: "Message players and parents directly from the platform." },
  { title: "Reporting", body: "Access reporting across your academy's players, coaches and programs." },
];

export const metadata = {
  title: "CRIC HQ for Cricket Academies | Player & Academy Management",
  description: "Manage players, coaches, sessions and development in one connected platform built for cricket academies.",
};

export default function AcademiesPage() {
  return (
    <PartnershipPageShell>
      <PageHero image="/hp/hero.jpg">
        <div className="flex justify-center mb-6"><Eyebrow>For Academies</Eyebrow></div>
        <EditorialHeading size="lg" level="h1">CRIC HQ for Academies</EditorialHeading>
        <p className="text-lg text-hp-paper/70 max-w-2xl mx-auto mt-6 mb-3">
          Everything you need to run and grow your cricket academy.
        </p>
        <p className="text-sm text-hp-paper/50 max-w-xl mx-auto mb-8">
          Manage players, coaches, programs and development in one connected platform.
        </p>
        <EditorialButton href="/organisations/academies/apply" size="lg">Register Your Interest</EditorialButton>
      </PageHero>

      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Capabilities */}
        <div className="mb-16">
          <div className="text-center mb-10"><EditorialHeading size="sm">Everything Your Academy Needs</EditorialHeading></div>
          <CapabilityGrid items={CAPABILITIES} cols={3} />
        </div>

        {/* Specialist program cross-sell */}
        <p className="text-center text-sm text-hp-paper/50 mb-16">
          Looking for specialist fast bowling coaching?{" "}
          <Link href="/programs/fast-bowling-development" className="text-hp-cg font-semibold hover:underline">
            Explore our Fast Bowling Development Program →
          </Link>
        </p>

        {/* Final CTA */}
        <div className="text-center pb-20">
          <EditorialHeading size="sm">Ready to Run Your Academy on CRIC HQ?</EditorialHeading>
          <p className="text-sm text-hp-paper/50 mt-4 mb-8">
            See how CRIC HQ can bring your players, coaches and programs into one connected platform.
          </p>
          <EditorialButton href="/organisations/academies/apply" size="lg">Register Your Interest</EditorialButton>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
