import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { Eyebrow, EditorialButton, EditorialHeading, CapabilityGrid } from "@/components/editorial/EditorialUI";
import Link from "next/link";

// Every item here maps to a capability the coach dashboard already has today (players,
// bookings/group sessions, attendance_records, action plans, assessments, biomechanics
// reports, messages) — written as delivered features, not aspirational ones.
const CAPABILITIES = [
  { title: "Player Management", body: "Keep every player's profile, history and progress organised in one place." },
  { title: "Session Planning", body: "Plan and schedule bookings, group sessions and session packs." },
  { title: "Attendance", body: "Record attendance for every session so participation is always up to date." },
  { title: "Development Plans", body: "Set development plans and track each player's priorities and progress." },
  { title: "Performance Tracking", body: "AI-assisted biomechanics reports and performance insights for every player." },
  { title: "Coach Notes", body: "Capture assessments, ratings and notes from every session." },
  { title: "Player Communication", body: "Message players and parents directly without leaving the platform." },
  { title: "Progress Reporting", body: "See a player's development and performance history at a glance." },
];

export const metadata = {
  title: "CRIC HQ for Cricket Coaches | Player Development Platform",
  description: "Spend less time on administration and more time developing players — session planning, attendance, development plans and performance tracking in one platform.",
};

export default function CoachesPage() {
  return (
    <PartnershipPageShell>
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hero */}
        <div className="pt-14 pb-16 text-center">
          <div className="flex justify-center mb-6"><Eyebrow>For Coaches</Eyebrow></div>
          <EditorialHeading size="lg" level="h1">CRIC HQ for Coaches</EditorialHeading>
          <p className="text-lg text-hp-paper/70 max-w-2xl mx-auto mt-6 mb-3">
            Spend less time managing administration. More time developing players.
          </p>
          <p className="text-sm text-hp-paper/50 max-w-xl mx-auto mb-8">
            Plan sessions, track attendance and development, and follow every player&apos;s progress in one connected platform.
          </p>
          <EditorialButton href="/organisations/coaches/apply" size="lg">Register Your Interest</EditorialButton>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <div className="text-center mb-10"><EditorialHeading size="sm">Everything You Need to Coach</EditorialHeading></div>
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
          <EditorialHeading size="sm">Ready to Coach with CRIC HQ?</EditorialHeading>
          <p className="text-sm text-hp-paper/50 mt-4 mb-8">
            See how CRIC HQ can take the administration off your plate so you can focus on coaching.
          </p>
          <EditorialButton href="/organisations/coaches/apply" size="lg">Register Your Interest</EditorialButton>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
