import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";

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
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hero */}
        <div className="pt-10 pb-16 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-pace-green mb-4">🏛 For Cricket Associations</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">CRIC HQ for Cricket Associations</h1>
          <p className="text-lg text-zinc-300 max-w-2xl mx-auto mb-3">
            Connect your cricket ecosystem in one platform.
          </p>
          <p className="text-sm text-zinc-500 max-w-xl mx-auto mb-8">
            Connect clubs, academies, coaches and player pathways while giving your association greater visibility across development and performance.
          </p>
          <Link href="/organisations/associations/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>

        {/* Hierarchy */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-2">One Connected Cricket Ecosystem</h2>
          <p className="text-sm text-zinc-500 text-center max-w-2xl mx-auto mb-8">
            Connect the organisations, people and programs that support player development — from association level through to the player.
          </p>
          <div className="bg-surface rounded-2xl p-8 flex flex-col items-center gap-3">
            {["Cricket Association", "Regions / Districts", "Clubs / Academies", "Programs", "Coaches"].map((step) => (
              <div key={step} className="flex flex-col items-center gap-3">
                <div className="px-5 py-2.5 rounded-xl bg-ink border border-zinc-700 text-zinc-300 text-sm font-semibold text-center">
                  {step}
                </div>
                <div className="w-px h-5 bg-zinc-700" />
              </div>
            ))}
            <div className="px-5 py-2.5 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-bold">
              Players
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">Built for Cricket Associations</h2>
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
          <h2 className="text-xl font-bold text-white mb-2">Ready to Connect Your Cricket Association?</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Tell us about your association and explore how CRIC HQ could support your cricket ecosystem.
          </p>
          <Link href="/organisations/associations/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
