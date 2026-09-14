import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";

const ORG_TYPES = [
  { icon: "🌏", title: "National Cricket Boards", body: "Manage cricket at national scale." },
  { icon: "🏏", title: "State Associations", body: "Connect regions and development pathways." },
  { icon: "📍", title: "Regional Associations", body: "Manage local cricket ecosystems." },
  { icon: "🏆", title: "District Associations", body: "Support clubs, coaches and players." },
];

const CAPABILITIES = [
  { title: "Player Development", body: "Track player progress and development." },
  { title: "Coaches", body: "Manage coaching programs and coaches." },
  { title: "Organisations", body: "Connect academies and affiliated organisations." },
  { title: "Performance", body: "Access performance insights." },
  { title: "AI Intelligence", body: "Analyse player development and assessments." },
  { title: "Reporting", body: "See board-wide data." },
];

export const metadata = { title: "Cricket Board Partnership — CRIC HQ" };

export default function CricketBoardLandingPage() {
  return (
    <PartnershipPageShell>
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hero */}
        <div className="pt-10 pb-16 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-pace-green mb-4">🏏 Cricket Board Partnership</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">Power Your Cricket Ecosystem</h1>
          <p className="text-lg text-zinc-300 max-w-2xl mx-auto mb-3">
            One connected platform for cricket boards and governing bodies.
          </p>
          <p className="text-sm text-zinc-500 max-w-xl mx-auto mb-8">
            Manage players, coaches, academies, programs and performance across your organisation.
          </p>
          <Link href="/partnerships/cricket-board/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>

        {/* Built for cricket organisations */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">Built for Cricket Organisations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ORG_TYPES.map((o) => (
              <div key={o.title} className="bg-surface rounded-2xl p-5 text-center">
                <div className="text-3xl mb-3">{o.icon}</div>
                <p className="text-white font-semibold text-sm mb-1">{o.title}</p>
                <p className="text-zinc-500 text-xs">{o.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* One connected ecosystem */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">One Connected Cricket Ecosystem</h2>
          <div className="bg-surface rounded-2xl p-8 flex flex-col items-center gap-3">
            {["Cricket Board", "Regions"].map((step) => (
              <div key={step} className="flex flex-col items-center gap-3">
                <div className="px-5 py-2.5 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-bold">
                  {step}
                </div>
                <div className="w-px h-5 bg-zinc-700" />
              </div>
            ))}
            <div className="flex flex-wrap justify-center gap-3">
              {["Academy", "Club", "Program"].map((step) => (
                <div key={step} className="px-5 py-2.5 rounded-xl bg-ink border border-zinc-700 text-zinc-300 text-sm font-semibold">
                  {step}
                </div>
              ))}
            </div>
            <div className="w-px h-5 bg-zinc-700" />
            <div className="px-5 py-2.5 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-bold">
              Players
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">What CRIC HQ Can Help You Manage</h2>
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
          <h2 className="text-xl font-bold text-white mb-6">Ready to Build a Connected Cricket Ecosystem?</h2>
          <Link href="/partnerships/cricket-board/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
