import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";

// Mirrors PartnershipApplicationForm's ORG_TYPES (minus "Other") so this section and the
// application form's own dropdown describe the same taxonomy.
const ORG_TYPES = [
  { icon: "🌏", title: "National Cricket Boards", body: "Manage cricket at national scale." },
  { icon: "🏏", title: "State Associations", body: "Connect regions and development pathways." },
  { icon: "📍", title: "Regional Associations", body: "Manage local cricket ecosystems." },
  { icon: "🏆", title: "District Associations", body: "Support clubs, coaches and players." },
  { icon: "🏫", title: "Academy Networks", body: "Connect affiliated academies and programs." },
  { icon: "🎯", title: "Professional Organisations", body: "Support elite pathways and performance." },
];

// Deliberately hedged ("can become", "often") rather than stated as universal fact — this
// describes a pattern many growing cricket organisations recognise, not a diagnosis of any one.
const PAIN_POINTS = [
  { title: "Fragmented Data", body: "Player and program information can become spread across multiple systems and spreadsheets." },
  { title: "Limited Visibility", body: "It can be difficult to understand what is happening across regions, academies, clubs and programs." },
  { title: "Disconnected Player Pathways", body: "Player development information can become difficult to follow as players move between programs, coaches and development levels." },
  { title: "Manual Reporting", body: "Teams can spend significant time collecting and consolidating information for reporting and decision-making." },
  { title: "Inconsistent Processes", body: "Different programs and organisations may use different approaches to managing development and performance." },
];

// Grounded in what the product actually does today (sessions, reports, biomechanics AI, coach
// management) — capabilities that would require a board/region data model the app doesn't have
// yet (see lib/types.ts's UserRole — no board-level role exists) are phrased as partnership-shaped
// ("can be shaped to...", "can be extended to...") rather than as delivered features.
const CAPABILITIES = [
  { title: "Player Pathways", body: "Track player development through sessions, reports and coaching plans as players progress." },
  { title: "Coaching Ecosystem", body: "Manage coaches and coaching programs, connected to player development." },
  { title: "Connected Organisations", body: "CRIC HQ partnerships can be shaped to connect your affiliated academies, clubs and programs as your organisation grows." },
  { title: "Performance Insights", body: "Understand player performance through AI-assisted biomechanics reports and insights that support coaching decisions." },
  { title: "Player Development Insights", body: "Use structured player development information to support better coaching and development decisions." },
  { title: "Organisation Reporting", body: "Reporting that can be extended to give decision-makers visibility across participation, development and performance." },
];

const OUTCOMES = [
  { title: "Better Visibility", body: "Understand what is happening across your cricket ecosystem." },
  { title: "Stronger Player Pathways", body: "Support player development across programs and development levels." },
  { title: "Better Decisions", body: "Use connected information to support planning and development decisions." },
  { title: "Less Administration", body: "Reduce manual processes and fragmented information." },
  { title: "Scalable Growth", body: "Create a connected structure that can grow with your organisation." },
];

const PARTNERSHIP_STEPS = [
  "Organisation Structure", "Platform Configuration", "Data & Integration Requirements", "Onboarding", "Training", "Go Live",
];

export const metadata = {
  title: "Cricket Board Partnership | CRIC HQ",
  description: "A connected cricket management and development platform for cricket boards, associations and governing bodies.",
};

export default function CricketBoardLandingPage() {
  return (
    <PartnershipPageShell>
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hero */}
        <div className="pt-10 pb-16 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-pace-green mb-4">🏏 Cricket Board Partnership</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">Power Your Cricket Ecosystem</h1>
          <p className="text-lg text-zinc-300 max-w-2xl mx-auto mb-3">
            One connected platform for cricket boards, associations and governing bodies.
          </p>
          <p className="text-sm text-zinc-500 max-w-xl mx-auto mb-8">
            Connect players, coaches, academies, clubs and programs while giving your organisation greater visibility across development and performance.
          </p>
          <Link href="/partnerships/cricket-board/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>

        {/* Built for cricket organisations */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">Built for Cricket Organisations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ORG_TYPES.map((o) => (
              <div key={o.title} className="bg-surface rounded-2xl p-5 text-center">
                <div className="text-3xl mb-3">{o.icon}</div>
                <p className="text-white font-semibold text-sm mb-1">{o.title}</p>
                <p className="text-zinc-500 text-xs">{o.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Problem / pain points */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-2">Is Your Cricket Ecosystem Running on Disconnected Systems?</h2>
          <p className="text-sm text-zinc-500 text-center max-w-2xl mx-auto mb-8">
            As cricket organisations grow, player, coaching, program and performance information can become spread across different systems, teams and processes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PAIN_POINTS.map((p) => (
              <div key={p.title} className="bg-surface rounded-2xl p-5">
                <p className="text-white font-semibold text-sm mb-1">{p.title}</p>
                <p className="text-zinc-500 text-xs">{p.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* One connected ecosystem */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-2">One Connected Cricket Ecosystem</h2>
          <p className="text-sm text-zinc-500 text-center max-w-2xl mx-auto mb-8">
            Connect the organisations, people and programs that support player development — from the board level through to the player.
          </p>
          <div className="bg-surface rounded-2xl p-8 flex flex-col items-center gap-3">
            {["Cricket Board", "Regions / Associations"].map((step) => (
              <div key={step} className="flex flex-col items-center gap-3">
                <div className="px-5 py-2.5 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-bold text-center">
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
            <div className="px-5 py-2.5 rounded-xl bg-ink border border-zinc-700 text-zinc-300 text-sm font-semibold">
              Coaches
            </div>
            <div className="w-px h-5 bg-zinc-700" />
            <div className="px-5 py-2.5 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-bold">
              Players
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">A Connected Platform for Cricket Organisations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="bg-surface rounded-2xl p-5">
                <p className="text-white font-semibold text-sm mb-1">{c.title}</p>
                <p className="text-zinc-500 text-xs">{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Outcomes */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">What CRIC HQ Helps You Achieve</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {OUTCOMES.map((o) => (
              <div key={o.title} className="bg-surface rounded-2xl p-5">
                <p className="text-pace-green font-semibold text-xs uppercase tracking-wider mb-1.5">{o.title}</p>
                <p className="text-zinc-400 text-sm">{o.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Built around your organisation */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-2">Built Around Your Organisation</h2>
          <p className="text-sm text-zinc-500 text-center max-w-2xl mx-auto mb-8">
            Every cricket organisation has a different structure, pathway and set of requirements. CRIC HQ partnerships can be shaped around your organisation, programs and operational needs.
          </p>
          <div className="bg-surface rounded-2xl p-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PARTNERSHIP_STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-ink border border-zinc-700">
                <span className="text-pace-green text-xs font-bold flex-shrink-0">{i + 1}</span>
                <span className="text-zinc-300 text-sm font-semibold">{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center pb-16">
          <h2 className="text-xl font-bold text-white mb-2">Ready to Build a More Connected Cricket Ecosystem?</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Tell us about your organisation and explore how CRIC HQ could support your cricket ecosystem.
          </p>
          <Link href="/partnerships/cricket-board/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
