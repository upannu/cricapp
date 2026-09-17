import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";

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
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hero */}
        <div className="pt-10 pb-16 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-pace-green mb-4">🏏 For Academies</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">CRIC HQ for Academies</h1>
          <p className="text-lg text-zinc-300 max-w-2xl mx-auto mb-3">
            Everything you need to run and grow your cricket academy.
          </p>
          <p className="text-sm text-zinc-500 max-w-xl mx-auto mb-8">
            Manage players, coaches, programs and development in one connected platform.
          </p>
          <Link href="/organisations/academies/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">Everything Your Academy Needs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="bg-surface rounded-2xl p-5">
                <p className="text-white font-semibold text-sm mb-1">{c.title}</p>
                <p className="text-zinc-500 text-xs">{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Specialist program cross-sell */}
        <p className="text-center text-sm text-zinc-500 mb-16">
          Looking for specialist fast bowling coaching?{" "}
          <Link href="/programs/fast-bowling-development" className="text-pace-green font-semibold hover:underline">
            Explore our Fast Bowling Development Program →
          </Link>
        </p>

        {/* Final CTA */}
        <div className="text-center pb-16">
          <h2 className="text-xl font-bold text-white mb-2">Ready to Run Your Academy on CRIC HQ?</h2>
          <p className="text-sm text-zinc-500 mb-6">
            See how CRIC HQ can bring your players, coaches and programs into one connected platform.
          </p>
          <Link href="/organisations/academies/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
