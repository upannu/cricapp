import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";

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
        <div className="pt-10 pb-16 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-pace-green mb-4">👨‍🏫 For Coaches</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">CRIC HQ for Coaches</h1>
          <p className="text-lg text-zinc-300 max-w-2xl mx-auto mb-3">
            Spend less time managing administration. More time developing players.
          </p>
          <p className="text-sm text-zinc-500 max-w-xl mx-auto mb-8">
            Plan sessions, track attendance and development, and follow every player&apos;s progress in one connected platform.
          </p>
          <Link href="/contact"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Explore Coaching
          </Link>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">Everything You Need to Coach</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="bg-surface rounded-2xl p-5">
                <p className="text-white font-semibold text-sm mb-1">{c.title}</p>
                <p className="text-zinc-500 text-xs">{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center pb-16">
          <h2 className="text-xl font-bold text-white mb-2">Ready to Coach with CRIC HQ?</h2>
          <p className="text-sm text-zinc-500 mb-6">
            See how CRIC HQ can take the administration off your plate so you can focus on coaching.
          </p>
          <Link href="/contact"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Explore Coaching
          </Link>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
